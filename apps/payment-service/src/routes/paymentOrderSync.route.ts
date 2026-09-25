import { Hono } from 'hono'
import { topics } from '@repo/kafka'
import { paymentPrisma, Prisma } from '@repo/payment-db'
import { shouldBeAdmin } from '../middleware/authMiddleware'
import {
  enqueueLifecycleReplay,
  runPaymentOrderReconciliation,
} from '../utils/paymentReconciliation'

const route = new Hono()
route.use('*', shouldBeAdmin)

export const successfulPaymentsAwaitingOrderWhere = {
  paymentStatus: 'SUCCEEDED',
  OR: [
    { orderAppliedVersion: null },
    { orderExists: false },
    {
      orderAppliedVersion: {
        lt: paymentPrisma.checkoutAttempt.fields.version,
      },
    },
  ],
} satisfies Prisma.CheckoutAttemptWhereInput

route.get('/summary', async (context) => {
  const [webhookGroups, outboxGroups, oldestPending, awaitingOrder] =
    await Promise.all([
      paymentPrisma.stripeWebhookInboxEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      paymentPrisma.paymentOutboxEvent.groupBy({
        by: ['status'],
        where: { topic: topics.payment_order_lifecycle },
        _count: { _all: true },
      }),
      paymentPrisma.stripeWebhookInboxEvent.findFirst({
        where: { status: { in: ['RECEIVED', 'PROCESSING'] } },
        orderBy: { receivedAt: 'asc' },
        select: { receivedAt: true },
      }),
      paymentPrisma.checkoutAttempt.count({
        where: successfulPaymentsAwaitingOrderWhere,
      }),
    ])

  return context.json({
    webhooks: Object.fromEntries(
      webhookGroups.map((group) => [group.status, group._count._all]),
    ),
    outbox: Object.fromEntries(
      outboxGroups.map((group) => [group.status, group._count._all]),
    ),
    oldestPendingAt: oldestPending?.receivedAt.toISOString() ?? null,
    successfulPaymentsAwaitingOrder: awaitingOrder,
  })
})

route.post('/reconcile', async (context) =>
  context.json(await runPaymentOrderReconciliation()),
)

route.get('/:orderId', async (context) => {
  const attempt = await paymentPrisma.checkoutAttempt.findUnique({
    where: { orderId: context.req.param('orderId') },
    omit: { stripeClientSecret: true, requestHash: true },
  })
  if (!attempt) {
    return context.json({ error: { code: 'PAYMENT_ATTEMPT_NOT_FOUND' } }, 404)
  }
  const outbox = await paymentPrisma.paymentOutboxEvent.findMany({
    where: {
      aggregateId: attempt.orderId,
      topic: topics.payment_order_lifecycle,
    },
    select: {
      id: true,
      aggregateVersion: true,
      eventType: true,
      status: true,
      attempts: true,
      nextAttemptAt: true,
      publishedAt: true,
      lastError: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return context.json({ attempt, outbox })
})

route.post('/:orderId/retry', async (context) => {
  const attempt = await paymentPrisma.checkoutAttempt.findUnique({
    where: { orderId: context.req.param('orderId') },
    select: { id: true },
  })
  if (!attempt) {
    return context.json({ error: { code: 'PAYMENT_ATTEMPT_NOT_FOUND' } }, 404)
  }
  const resetWebhooks = await paymentPrisma.stripeWebhookInboxEvent.updateMany({
    where: {
      status: 'FAILED',
      payload: {
        path: ['data', 'object', 'metadata', 'paymentAttemptId'],
        equals: attempt.id,
      },
    },
    data: {
      status: 'RECEIVED',
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      claimToken: null,
      lastError: null,
    },
  })
  const replayQueued = await enqueueLifecycleReplay(attempt.id)
  return context.json({
    resetWebhookJobs: resetWebhooks.count,
    replayQueued,
  })
})

export default route
