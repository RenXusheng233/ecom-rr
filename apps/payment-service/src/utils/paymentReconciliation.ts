import { randomUUID } from 'node:crypto'
import type Stripe from 'stripe'
import { topics } from '@repo/kafka'
import { paymentPrisma, type Prisma } from '@repo/payment-db'
import type { PaymentStatus, ShippingSnapshot } from '@repo/types'
import type { CheckoutItemSnapshot } from './checkoutCatalog'
import {
  buildStripeCheckoutSessionRequest,
  checkoutReturnUrl,
  checkoutSessionIdempotencyKey,
} from './checkoutSession'
import {
  createPaymentLifecycleEvent,
  type PaymentLifecycleAttempt,
} from './paymentLifecycleEvent'

export const needsOrderReplay = (
  version: number,
  orderAppliedVersion: number | null,
) =>
  version > 0 && (orderAppliedVersion === null || orderAppliedVersion < version)

export const needsCheckoutSessionRecovery = (
  paymentStatus: PaymentStatus,
  stripeCheckoutSessionId: string | null,
) => paymentStatus === 'CREATING' && stripeCheckoutSessionId === null

type ReconciliationSessionState = {
  status: 'open' | 'complete' | 'expired' | null
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required'
}

type ReconciliationIntentState = {
  status: Stripe.PaymentIntent.Status
  hasLastPaymentError: boolean
}

export const selectStripeReconciliationTruth = (
  session: ReconciliationSessionState,
  intent: ReconciliationIntentState | null,
): {
  eventType:
    | 'checkout.session.completed'
    | 'checkout.session.expired'
    | 'payment_intent.succeeded'
    | 'payment_intent.payment_failed'
    | 'payment_intent.canceled'
  source: 'session' | 'payment_intent'
} | null => {
  if (intent?.status === 'succeeded') {
    return {
      eventType: 'payment_intent.succeeded',
      source: 'payment_intent',
    }
  }
  if (intent?.status === 'canceled') {
    return {
      eventType: 'payment_intent.canceled',
      source: 'payment_intent',
    }
  }
  if (
    intent?.status === 'requires_payment_method' &&
    intent.hasLastPaymentError
  ) {
    return {
      eventType: 'payment_intent.payment_failed',
      source: 'payment_intent',
    }
  }
  if (session.status === 'expired') {
    return { eventType: 'checkout.session.expired', source: 'session' }
  }
  if (
    session.status === 'complete' ||
    session.paymentStatus === 'paid' ||
    session.paymentStatus === 'no_payment_required'
  ) {
    return { eventType: 'checkout.session.completed', source: 'session' }
  }
  return null
}

const toLifecycleAttempt = (attempt: {
  id: string
  orderId: string
  userId: string
  paymentStatus: PaymentLifecycleAttempt['paymentStatus']
  refundStatus: PaymentLifecycleAttempt['refundStatus']
  disputeStatus: PaymentLifecycleAttempt['disputeStatus']
  version: number
  currency: string
  amountTotal: number
  amountRefunded: number
  itemsSnapshot: Prisma.JsonValue
  stripeCheckoutSessionId: string | null
  stripePaymentIntentId: string | null
  email: string | null
  shippingSnapshot: Prisma.JsonValue | null
}): PaymentLifecycleAttempt => ({
  ...attempt,
  itemsSnapshot: attempt.itemsSnapshot as CheckoutItemSnapshot[],
  shippingSnapshot: attempt.shippingSnapshot as ShippingSnapshot | null,
})

export const enqueueLifecycleReplay = async (attemptId: string) => {
  return paymentPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "CheckoutAttempt"
      WHERE "id" = ${attemptId}
      FOR UPDATE
    `
    const attempt = await tx.checkoutAttempt.findUnique({
      where: { id: attemptId },
    })
    if (
      !attempt ||
      !needsOrderReplay(attempt.version, attempt.orderAppliedVersion) ||
      !attempt.stripeCheckoutSessionId
    ) {
      return false
    }

    const pending = await tx.paymentOutboxEvent.findFirst({
      where: {
        aggregateId: attempt.orderId,
        aggregateVersion: attempt.version,
        topic: topics.payment_order_lifecycle,
        status: 'PENDING',
      },
      select: { id: true },
    })
    if (pending) {
      await tx.checkoutAttempt.update({
        where: { id: attempt.id },
        data: { lastOrderReplayAt: new Date() },
      })
      return false
    }

    const event = createPaymentLifecycleEvent(
      toLifecycleAttempt(attempt),
      `reconcile:${attempt.id}:${attempt.version}`,
    )
    await tx.paymentOutboxEvent.create({
      data: {
        id: event.id,
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion,
        topic: topics.payment_order_lifecycle,
        messageKey: event.aggregateId,
        eventType: event.type,
        schemaVersion: event.schemaVersion,
        correlationId: event.correlationId,
        causationId: event.causationId,
        payload: event as Prisma.InputJsonValue,
      },
    })
    await tx.checkoutAttempt.update({
      where: { id: attempt.id },
      data: { lastOrderReplayAt: new Date() },
    })
    return true
  })
}

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002'

const persistReconciliationEvent = async (input: {
  eventId: string
  eventType: string
  created: number
  object: object
}) => {
  const payload = {
    id: input.eventId,
    object: 'event',
    type: input.eventType,
    created: input.created,
    data: { object: input.object },
  }
  try {
    await paymentPrisma.stripeWebhookInboxEvent.create({
      data: {
        id: input.eventId,
        eventType: input.eventType,
        stripeCreatedAt: new Date(input.created * 1000),
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    })
    return true
  } catch (error) {
    if (isUniqueViolation(error)) return false
    throw error
  }
}

const persistSessionTruth = async (attempt: {
  id: string
  stripeCheckoutSessionId: string
}) => {
  const { default: stripe } = await import('./stripe')
  const session = await stripe.checkout.sessions.retrieve(
    attempt.stripeCheckoutSessionId,
    { expand: ['payment_intent.latest_charge'] },
  )
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null)
  const paymentIntent = paymentIntentId
    ? await stripe.paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge'],
      })
    : null
  const truth = selectStripeReconciliationTruth(
    { status: session.status, paymentStatus: session.payment_status },
    paymentIntent
      ? {
          status: paymentIntent.status,
          hasLastPaymentError: paymentIntent.last_payment_error !== null,
        }
      : null,
  )
  let enqueuedEvents = 0
  const now = Math.floor(Date.now() / 1000)

  if (truth) {
    const source =
      truth.source === 'payment_intent' && paymentIntent
        ? paymentIntent
        : session
    const sourceState =
      truth.source === 'payment_intent' && paymentIntent
        ? paymentIntent.status
        : `${session.status}:${session.payment_status}`
    const observedAt =
      truth.eventType === 'checkout.session.completed' &&
      session.payment_status === 'unpaid'
        ? session.created
        : now
    if (
      await persistReconciliationEvent({
        eventId: `reconcile:${session.id}:${truth.eventType}:${sourceState}`,
        eventType: truth.eventType,
        created: observedAt,
        object: source,
      })
    ) {
      enqueuedEvents += 1
    }
  }

  const latestCharge = paymentIntent?.latest_charge
  const charge =
    typeof latestCharge === 'string'
      ? await stripe.charges.retrieve(latestCharge)
      : latestCharge
  if (charge?.amount_refunded && charge.amount_refunded > 0) {
    if (
      await persistReconciliationEvent({
        eventId: `reconcile:${charge.id}:charge.refunded:${charge.amount_refunded}`,
        eventType: 'charge.refunded',
        created: now,
        object: charge,
      })
    ) {
      enqueuedEvents += 1
    }
  }

  if (charge) {
    const disputes = await stripe.disputes.list({
      charge: charge.id,
      limit: 10,
    })
    const dispute = disputes.data[0]
    if (dispute) {
      const closed = dispute.status === 'won' || dispute.status === 'lost'
      const eventType = closed
        ? 'charge.dispute.closed'
        : 'charge.dispute.created'
      if (
        await persistReconciliationEvent({
          eventId: `reconcile:${dispute.id}:${eventType}:${dispute.status}`,
          eventType,
          created: now,
          object: dispute,
        })
      ) {
        enqueuedEvents += 1
      }
    }
  }

  return enqueuedEvents
}

const confirmRecoveredSession = async (input: {
  attemptId: string
  stripeCheckoutSessionId: string
  stripeClientSecret: string
}) => {
  await paymentPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "CheckoutAttempt"
      WHERE "id" = ${input.attemptId}
      FOR UPDATE
    `
    const current = await tx.checkoutAttempt.findUnique({
      where: { id: input.attemptId },
    })
    if (!current) throw new Error('Checkout attempt no longer exists')
    if (
      current.stripeCheckoutSessionId &&
      current.stripeCheckoutSessionId !== input.stripeCheckoutSessionId
    ) {
      throw new Error('Checkout attempt has another Stripe session')
    }
    await tx.checkoutAttempt.update({
      where: { id: input.attemptId },
      data: {
        paymentStatus:
          current.paymentStatus === 'CREATING' ? 'OPEN' : current.paymentStatus,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripeClientSecret: input.stripeClientSecret,
        lastError: null,
      },
    })
  })
}

const recoverCheckoutSession = async (attempt: {
  id: string
  orderId: string
  userId: string
  itemsSnapshot: Prisma.JsonValue
}) => {
  const { default: stripe } = await import('./stripe')
  const items = attempt.itemsSnapshot as unknown as CheckoutItemSnapshot[]
  const sessionInput = {
    userId: attempt.userId,
    paymentAttemptId: attempt.id,
    orderId: attempt.orderId,
    lineItems: items.map((item) => ({
      price: item.stripePriceId,
      quantity: item.quantity,
    })),
    returnUrl: checkoutReturnUrl(
      process.env.CLIENT_APP_URL ?? 'http://localhost:3000',
    ),
  }
  const session = await stripe.checkout.sessions.create(
    buildStripeCheckoutSessionRequest(sessionInput),
    { idempotencyKey: checkoutSessionIdempotencyKey(attempt.id) },
  )
  if (!session.client_secret) {
    throw new Error('Stripe Checkout Session has no client secret')
  }
  await confirmRecoveredSession({
    attemptId: attempt.id,
    stripeCheckoutSessionId: session.id,
    stripeClientSecret: session.client_secret,
  })
}

const cleanupProcessedWebhooks = async () => {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const expired = await paymentPrisma.stripeWebhookInboxEvent.findMany({
    where: {
      status: { in: ['PROCESSED', 'IGNORED'] },
      processedAt: { lt: cutoff },
    },
    select: { id: true },
    orderBy: { processedAt: 'asc' },
    take: 500,
  })
  if (expired.length === 0) return 0
  const deleted = await paymentPrisma.stripeWebhookInboxEvent.deleteMany({
    where: { id: { in: expired.map(({ id }) => id) } },
  })
  return deleted.count
}

export const runPaymentOrderReconciliation = async () => {
  const unconfirmedStripeSessions =
    await paymentPrisma.checkoutAttempt.findMany({
      where: { paymentStatus: 'CREATING', stripeCheckoutSessionId: null },
      select: {
        id: true,
        orderId: true,
        userId: true,
        itemsSnapshot: true,
      },
      orderBy: [
        { lastStripeReconciledAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
      take: 100,
    })
  let recoveredStripeSessions = 0
  let failedStripeRecoveries = 0
  for (const attempt of unconfirmedStripeSessions) {
    try {
      await recoverCheckoutSession(attempt)
      recoveredStripeSessions += 1
    } catch {
      failedStripeRecoveries += 1
    }
    await paymentPrisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: { lastStripeReconciledAt: new Date() },
    })
  }

  const reconciliationCandidates = await paymentPrisma.checkoutAttempt.findMany(
    {
      where: {
        stripeCheckoutSessionId: { not: null },
      },
      select: { id: true, stripeCheckoutSessionId: true },
      orderBy: [
        { lastStripeReconciledAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'asc' },
      ],
      take: 100,
    },
  )
  let enqueuedWebhookEvents = 0
  let failedStripeChecks = 0
  for (const attempt of reconciliationCandidates) {
    try {
      if (attempt.stripeCheckoutSessionId) {
        enqueuedWebhookEvents += await persistSessionTruth({
          id: attempt.id,
          stripeCheckoutSessionId: attempt.stripeCheckoutSessionId,
        })
      }
    } catch {
      failedStripeChecks += 1
    }
    await paymentPrisma.checkoutAttempt.update({
      where: { id: attempt.id },
      data: { lastStripeReconciledAt: new Date() },
    })
  }

  const unconfirmed = await paymentPrisma.checkoutAttempt.findMany({
    where: {
      version: { gt: 0 },
      OR: [
        { orderAppliedVersion: null },
        {
          orderAppliedVersion: {
            lt: paymentPrisma.checkoutAttempt.fields.version,
          },
        },
      ],
    },
    select: { id: true },
    orderBy: [
      { lastOrderReplayAt: { sort: 'asc', nulls: 'first' } },
      { createdAt: 'asc' },
    ],
    take: 500,
  })
  let replayedOrderEvents = 0
  for (const attempt of unconfirmed) {
    if (await enqueueLifecycleReplay(attempt.id)) replayedOrderEvents += 1
  }

  return {
    checkoutRecoveryCandidates: unconfirmedStripeSessions.length,
    recoveredStripeSessions,
    failedStripeRecoveries,
    checkedStripeSessions: reconciliationCandidates.length,
    enqueuedWebhookEvents,
    failedStripeChecks,
    replayedOrderEvents,
    deletedProcessedWebhooks: await cleanupProcessedWebhooks(),
  }
}

export const startPaymentOrderReconciliation = () => {
  let running = false
  const interval = Number(
    process.env.PAYMENT_RECONCILIATION_INTERVAL_MS ?? 15 * 60 * 1000,
  )
  const run = async () => {
    if (running) return
    running = true
    try {
      const summary = await runPaymentOrderReconciliation()
      console.log('Payment/Order reconciliation completed', summary)
    } catch (error) {
      console.error('Payment/Order reconciliation failed', error)
    } finally {
      running = false
    }
  }
  return setInterval(() => void run(), Math.max(interval, 10_000))
}
