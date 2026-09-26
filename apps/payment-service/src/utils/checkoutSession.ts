import type { CheckoutRequest } from '@repo/types'
import type { CheckoutItemSnapshot } from './checkoutCatalog'
import {
  hashCheckoutRequest,
  normalizeCheckoutRequest,
} from './checkoutRequest'

export type CheckoutCatalogSnapshot = {
  lineItems: Array<{ price: string; quantity: number }>
  items: CheckoutItemSnapshot[]
  amountTotal: number
  currency: 'usd'
}

export type CheckoutAttemptRecord = {
  id: string
  orderId: string
  userId: string
  clientRequestId: string
  requestHash: string
  amountTotal: number
  currency: 'usd'
  itemsSnapshot: CheckoutItemSnapshot[]
  stripeCheckoutSessionId: string | null
  stripeClientSecret: string | null
}

type NewCheckoutAttempt = Omit<
  CheckoutAttemptRecord,
  'id' | 'orderId' | 'stripeCheckoutSessionId' | 'stripeClientSecret'
>

export type CheckoutDependencies = {
  resolveCatalog(request: CheckoutRequest): Promise<CheckoutCatalogSnapshot>
  findAttempt(
    userId: string,
    clientRequestId: string,
  ): Promise<CheckoutAttemptRecord | null>
  createAttempt(input: NewCheckoutAttempt): Promise<CheckoutAttemptRecord>
  confirmSession(input: {
    attemptId: string
    stripeCheckoutSessionId: string
    stripeClientSecret: string
  }): Promise<void>
  failAttempt(input: { attemptId: string; error: string }): Promise<void>
  createStripeSession(
    input: {
      userId: string
      paymentAttemptId: string
      orderId: string
      lineItems: Array<{ price: string; quantity: number }>
      returnUrl: string
    },
    idempotencyKey: string,
  ): Promise<{ id: string; clientSecret: string }>
}

export class IdempotencyKeyReusedError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED'
}

export class CheckoutCreationRetryableError extends Error {
  readonly code = 'CHECKOUT_CREATION_RETRYABLE'
}

export class CheckoutCreationFailedError extends Error {
  readonly code = 'CHECKOUT_CREATION_FAILED'
}

export const checkoutSessionIdempotencyKey = (attemptId: string) =>
  `checkout-session:${attemptId}:v1`

export const checkoutReturnUrl = (clientAppUrl: string) =>
  `${clientAppUrl.replace(/\/$/, '')}/return?session_id={CHECKOUT_SESSION_ID}`

export const buildStripeCheckoutSessionRequest = (input: {
  userId: string
  paymentAttemptId: string
  orderId: string
  lineItems: Array<{ price: string; quantity: number }>
  returnUrl: string
}) => ({
  client_reference_id: input.userId,
  line_items: input.lineItems,
  mode: 'payment' as const,
  ui_mode: 'custom' as const,
  return_url: input.returnUrl,
  phone_number_collection: { enabled: true },
  metadata: {
    paymentAttemptId: input.paymentAttemptId,
    orderId: input.orderId,
    userId: input.userId,
  },
  payment_intent_data: {
    metadata: {
      paymentAttemptId: input.paymentAttemptId,
      orderId: input.orderId,
      userId: input.userId,
    },
  },
})

const isRetryableStripeError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { type?: string; statusCode?: number }
  return (
    candidate.statusCode === 429 ||
    (candidate.statusCode !== undefined && candidate.statusCode >= 500) ||
    candidate.type === 'StripeConnectionError' ||
    candidate.type === 'StripeAPIError' ||
    candidate.type === 'StripeRateLimitError'
  )
}

const resultFromAttempt = (attempt: CheckoutAttemptRecord) => {
  if (!attempt.stripeClientSecret) return null
  return {
    checkoutSessionClientSecret: attempt.stripeClientSecret,
    paymentAttemptId: attempt.id,
    orderId: attempt.orderId,
  }
}

export const createOrResumeCheckout = async (
  input: {
    userId: string
    clientRequestId: string
    request: CheckoutRequest
    clientAppUrl: string
  },
  dependencies: CheckoutDependencies,
) => {
  const normalized = normalizeCheckoutRequest(input.request)
  const requestHash = hashCheckoutRequest(normalized)
  let attempt = await dependencies.findAttempt(
    input.userId,
    input.clientRequestId,
  )

  if (attempt && attempt.requestHash !== requestHash) {
    throw new IdempotencyKeyReusedError(
      'The idempotency key was already used for another checkout request',
    )
  }

  const existingResult = attempt ? resultFromAttempt(attempt) : null
  if (existingResult) return existingResult

  if (!attempt) {
    const catalog = await dependencies.resolveCatalog(normalized)
    attempt = await dependencies.createAttempt({
      userId: input.userId,
      clientRequestId: input.clientRequestId,
      requestHash,
      amountTotal: catalog.amountTotal,
      currency: catalog.currency,
      itemsSnapshot: catalog.items,
    })
    if (attempt.requestHash !== requestHash) {
      throw new IdempotencyKeyReusedError(
        'The idempotency key was already used for another checkout request',
      )
    }
    const concurrentResult = resultFromAttempt(attempt)
    if (concurrentResult) return concurrentResult
  }

  const lineItems = attempt.itemsSnapshot.map((item) => ({
    price: item.stripePriceId,
    quantity: item.quantity,
  }))
  const idempotencyKey = checkoutSessionIdempotencyKey(attempt.id)
  const returnUrl = checkoutReturnUrl(input.clientAppUrl)

  let session: { id: string; clientSecret: string }
  try {
    session = await dependencies.createStripeSession(
      {
        userId: input.userId,
        paymentAttemptId: attempt.id,
        orderId: attempt.orderId,
        lineItems,
        returnUrl,
      },
      idempotencyKey,
    )
  } catch (error) {
    if (isRetryableStripeError(error)) {
      throw new CheckoutCreationRetryableError(
        'Stripe Checkout creation can be retried safely',
      )
    }
    const message = error instanceof Error ? error.message : String(error)
    await dependencies.failAttempt({ attemptId: attempt.id, error: message })
    throw new CheckoutCreationFailedError('Stripe Checkout creation failed')
  }

  try {
    await dependencies.confirmSession({
      attemptId: attempt.id,
      stripeCheckoutSessionId: session.id,
      stripeClientSecret: session.clientSecret,
    })
  } catch {
    throw new CheckoutCreationRetryableError(
      'Stripe Checkout was created but local confirmation must be retried',
    )
  }

  return {
    checkoutSessionClientSecret: session.clientSecret,
    paymentAttemptId: attempt.id,
    orderId: attempt.orderId,
  }
}
