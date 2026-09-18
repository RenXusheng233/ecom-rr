import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { topics } from '@repo/kafka'
import { paymentPrisma, Prisma } from '@repo/payment-db'
import type {
  DisputeStatus,
  PaymentStatus,
  RefundStatus,
  ShippingSnapshot,
} from '@repo/types'
import { createPaymentLifecycleEvent } from './paymentLifecycleEvent'
import { getPaymentRetryDecision } from './paymentRetry'
import { applyPaymentTransition } from './paymentState'
import {
  normalizeStripeEvent,
  type NormalizedStripePaymentEvent,
} from './stripeWebhookEvent'

const BATCH_SIZE = 25
const LEASE_MS = 5 * 60 * 1000
const HEARTBEAT_MS = 30 * 1000

export class PermanentWebhookError extends Error {
  readonly permanent = true
}

class WebhookClaimLostError extends Error {}

type ProjectableAttempt = {
  id: string
  orderId: string
  userId: string
  paymentStatus: PaymentStatus
  refundStatus: RefundStatus
  disputeStatus: DisputeStatus
  version: number
  currency: string
  amountTotal: number
  amountRefunded: number
  itemsSnapshot: unknown
  email: string | null
  shippingSnapshot: ShippingSnapshot | null
  stripeCheckoutSessionId: string | null
  stripePaymentIntentId: string | null
  lastStripeEventCreatedAt: Date | null
}

const sameJson = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right)

const hasDisputeCommand = (event: NormalizedStripePaymentEvent) =>
  event.command.type === 'DISPUTE_OPENED' ||
  event.command.type === 'DISPUTE_CLOSED'

const hasPaymentStatusCommand = (event: NormalizedStripePaymentEvent) =>
  event.command.type === 'CHECKOUT_COMPLETED' ||
  event.command.type === 'PAYMENT_SUCCEEDED' ||
  event.command.type === 'PAYMENT_FAILED' ||
  event.command.type === 'PAYMENT_CANCELED' ||
  event.command.type === 'CHECKOUT_EXPIRED'

export const projectStripePaymentEvent = (
  attempt: ProjectableAttempt,
  event: NormalizedStripePaymentEvent,
): { next: ProjectableAttempt; changed: boolean } => {
  if (event.paymentAttemptId && event.paymentAttemptId !== attempt.id) {
    throw new PermanentWebhookError('Payment attempt ownership mismatch')
  }
  if (event.userId && event.userId !== attempt.userId) {
    throw new PermanentWebhookError('Payment user ownership mismatch')
  }
  if (event.currency && event.currency !== attempt.currency) {
    throw new PermanentWebhookError('Payment currency mismatch')
  }
  if (
    event.amountTotal !== null &&
    !hasDisputeCommand(event) &&
    event.amountTotal !== attempt.amountTotal
  ) {
    throw new PermanentWebhookError('Payment amount mismatch')
  }
  if (
    event.stripeCheckoutSessionId &&
    attempt.stripeCheckoutSessionId &&
    event.stripeCheckoutSessionId !== attempt.stripeCheckoutSessionId
  ) {
    throw new PermanentWebhookError('Checkout Session identifier mismatch')
  }
  if (
    event.stripePaymentIntentId &&
    attempt.stripePaymentIntentId &&
    event.stripePaymentIntentId !== attempt.stripePaymentIntentId
  ) {
    throw new PermanentWebhookError('PaymentIntent identifier mismatch')
  }

  const currentState = {
    paymentStatus: attempt.paymentStatus,
    refundStatus: attempt.refundStatus,
    disputeStatus: attempt.disputeStatus,
    amountTotal: attempt.amountTotal,
    amountRefunded: attempt.amountRefunded,
  }
  const isPaymentStatusEvent = hasPaymentStatusCommand(event)
  const isStalePaymentStatusEvent =
    isPaymentStatusEvent &&
    attempt.lastStripeEventCreatedAt !== null &&
    event.stripeCreatedAt < attempt.lastStripeEventCreatedAt
  const transition = isStalePaymentStatusEvent
    ? { next: currentState, changed: false }
    : applyPaymentTransition(currentState, event.command)
  const shippingSnapshot = event.shipping ?? attempt.shippingSnapshot
  const email = event.email ?? attempt.email
  const stripeCheckoutSessionId =
    event.stripeCheckoutSessionId ?? attempt.stripeCheckoutSessionId
  const stripePaymentIntentId =
    event.stripePaymentIntentId ?? attempt.stripePaymentIntentId
  const changed =
    transition.changed ||
    email !== attempt.email ||
    !sameJson(shippingSnapshot, attempt.shippingSnapshot) ||
    stripeCheckoutSessionId !== attempt.stripeCheckoutSessionId ||
    stripePaymentIntentId !== attempt.stripePaymentIntentId
  const lastStripeEventCreatedAt = isPaymentStatusEvent
    ? !attempt.lastStripeEventCreatedAt ||
      event.stripeCreatedAt > attempt.lastStripeEventCreatedAt
      ? event.stripeCreatedAt
      : attempt.lastStripeEventCreatedAt
    : attempt.lastStripeEventCreatedAt

  return {
    next: {
      ...attempt,
      ...transition.next,
      email,
      shippingSnapshot,
      stripeCheckoutSessionId,
      stripePaymentIntentId,
      lastStripeEventCreatedAt,
      version: changed ? attempt.version + 1 : attempt.version,
    },
    changed,
  }
}

const resolvePaymentIntent = async (
  event: NormalizedStripePaymentEvent,
): Promise<NormalizedStripePaymentEvent> => {
  if (event.stripePaymentIntentId || !event.stripeChargeId) return event
  const { default: stripe } = await import('./stripe')
  const charge = await stripe.charges.retrieve(event.stripeChargeId)
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null)
  const metadata = charge.metadata
  return {
    ...event,
    stripePaymentIntentId: paymentIntentId,
    paymentAttemptId:
      event.paymentAttemptId ?? metadata.paymentAttemptId ?? null,
    userId: event.userId ?? metadata.userId ?? null,
  }
}

const findAttemptId = async (event: NormalizedStripePaymentEvent) => {
  if (event.paymentAttemptId) {
    const attempt = await paymentPrisma.checkoutAttempt.findUnique({
      where: { id: event.paymentAttemptId },
      select: { id: true },
    })
    if (attempt) return attempt.id
  }
  if (event.stripeCheckoutSessionId) {
    const attempt = await paymentPrisma.checkoutAttempt.findUnique({
      where: { stripeCheckoutSessionId: event.stripeCheckoutSessionId },
      select: { id: true },
    })
    if (attempt) return attempt.id
  }
  if (event.stripePaymentIntentId) {
    const attempt = await paymentPrisma.checkoutAttempt.findUnique({
      where: { stripePaymentIntentId: event.stripePaymentIntentId },
      select: { id: true },
    })
    if (attempt) return attempt.id
  }
  throw new PermanentWebhookError('Webhook cannot be attributed to an attempt')
}

const commitPaymentEvent = async (
  event: NormalizedStripePaymentEvent,
  attemptId: string,
  claimToken: string,
) => {
  await paymentPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "CheckoutAttempt"
      WHERE "id" = ${attemptId}
      FOR UPDATE
    `
    const stored = await tx.checkoutAttempt.findUnique({
      where: { id: attemptId },
    })
    if (!stored) {
      throw new PermanentWebhookError('Checkout attempt no longer exists')
    }

    const projected = projectStripePaymentEvent(
      {
        ...stored,
        shippingSnapshot: stored.shippingSnapshot as ShippingSnapshot | null,
      },
      event,
    )

    if (projected.changed && !projected.next.stripeCheckoutSessionId) {
      throw new PermanentWebhookError(
        'Payment projection has no Checkout Session identifier',
      )
    }

    await tx.checkoutAttempt.update({
      where: { id: attemptId },
      data: {
        paymentStatus: projected.next.paymentStatus,
        refundStatus: projected.next.refundStatus,
        disputeStatus: projected.next.disputeStatus,
        amountRefunded: projected.next.amountRefunded,
        version: projected.next.version,
        email: projected.next.email,
        shippingSnapshot:
          projected.next.shippingSnapshot === null
            ? Prisma.DbNull
            : (projected.next.shippingSnapshot as Prisma.InputJsonValue),
        stripeCheckoutSessionId: projected.next.stripeCheckoutSessionId,
        stripePaymentIntentId: projected.next.stripePaymentIntentId,
        lastStripeEventCreatedAt: projected.next.lastStripeEventCreatedAt,
        lastError: null,
      },
    })

    if (projected.changed) {
      const lifecycleEvent = createPaymentLifecycleEvent(
        {
          ...projected.next,
          itemsSnapshot: projected.next.itemsSnapshot as never[],
        },
        event.eventId,
      )
      await tx.paymentOutboxEvent.create({
        data: {
          id: lifecycleEvent.id,
          aggregateId: lifecycleEvent.aggregateId,
          aggregateVersion: lifecycleEvent.aggregateVersion,
          topic: topics.payment_order_lifecycle,
          messageKey: lifecycleEvent.aggregateId,
          eventType: lifecycleEvent.type,
          schemaVersion: lifecycleEvent.schemaVersion,
          correlationId: lifecycleEvent.correlationId,
          causationId: lifecycleEvent.causationId,
          payload: lifecycleEvent as Prisma.InputJsonValue,
        },
      })
    }

    const completed = await tx.stripeWebhookInboxEvent.updateMany({
      where: { id: event.eventId, claimToken, status: 'PROCESSING' },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        leaseUntil: null,
        claimToken: null,
        lastError: null,
      },
    })
    if (completed.count === 0) throw new WebhookClaimLostError()
  })
}

const markIgnored = async (eventId: string, claimToken: string) => {
  await paymentPrisma.stripeWebhookInboxEvent.updateMany({
    where: { id: eventId, claimToken, status: 'PROCESSING' },
    data: {
      status: 'IGNORED',
      processedAt: new Date(),
      leaseUntil: null,
      claimToken: null,
      lastError: null,
    },
  })
}

const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000)

const handleFailure = async (
  eventId: string,
  claimToken: string,
  previousAttempts: number,
  error: unknown,
) => {
  const attempt = previousAttempts + 1
  const decision = getPaymentRetryDecision(error, attempt)
  await paymentPrisma.stripeWebhookInboxEvent.updateMany({
    where: { id: eventId, claimToken, status: 'PROCESSING' },
    data: decision.retry
      ? {
          status: 'RECEIVED',
          attempts: attempt,
          nextAttemptAt: decision.nextAttemptAt!,
          leaseUntil: null,
          claimToken: null,
          lastError: errorMessage(error),
        }
      : {
          status: 'FAILED',
          attempts: attempt,
          leaseUntil: null,
          claimToken: null,
          lastError: errorMessage(error),
        },
  })
}

export const runStripeWebhookBatch = async () => {
  const batchStartedAt = new Date()
  const jobs = await paymentPrisma.stripeWebhookInboxEvent.findMany({
    where: {
      status: { in: ['RECEIVED', 'PROCESSING'] },
      nextAttemptAt: { lte: batchStartedAt },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: batchStartedAt } }],
    },
    orderBy: { receivedAt: 'asc' },
    take: BATCH_SIZE,
  })

  for (const job of jobs) {
    const claimToken = randomUUID()
    const claimNow = new Date()
    const claimed = await paymentPrisma.stripeWebhookInboxEvent.updateMany({
      where: {
        id: job.id,
        status: { in: ['RECEIVED', 'PROCESSING'] },
        nextAttemptAt: { lte: claimNow },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: claimNow } }],
      },
      data: {
        status: 'PROCESSING',
        claimToken,
        leaseUntil: new Date(claimNow.getTime() + LEASE_MS),
      },
    })
    if (claimed.count === 0) continue

    const heartbeat = setInterval(() => {
      void paymentPrisma.stripeWebhookInboxEvent
        .updateMany({
          where: { id: job.id, claimToken, status: 'PROCESSING' },
          data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        })
        .catch((error) =>
          console.error('Stripe Webhook lease heartbeat failed', error),
        )
    }, HEARTBEAT_MS)
    heartbeat.unref()

    try {
      const normalized = normalizeStripeEvent(
        job.payload as unknown as Stripe.Event,
      )
      if (normalized.kind === 'IGNORED') {
        await markIgnored(job.id, claimToken)
        continue
      }
      const resolved = await resolvePaymentIntent(normalized)
      const attemptId = await findAttemptId(resolved)
      await commitPaymentEvent(resolved, attemptId, claimToken)
    } catch (error) {
      if (!(error instanceof WebhookClaimLostError)) {
        await handleFailure(job.id, claimToken, job.attempts, error)
      }
    } finally {
      clearInterval(heartbeat)
    }
  }
}

export const startStripeWebhookWorker = () => {
  let running = false
  const poll = async () => {
    if (running) return
    running = true
    try {
      await runStripeWebhookBatch()
    } catch (error) {
      console.error('Stripe Webhook worker failed', error)
    } finally {
      running = false
    }
  }

  void poll()
  return setInterval(() => void poll(), 1000)
}
