import type { FastifyInstance } from 'fastify'
import {
  Order,
  OrderOutboxEvent,
  PaymentEventInbox,
  RejectedPaymentEvent,
} from '@repo/order-db'
import { shouldBeAdmin } from '../middleware/authMiddleware'

const countsByStatus = async (model: typeof PaymentEventInbox) => {
  const rows = await model.aggregate<{ _id: string; count: number }>([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])
  return Object.fromEntries(rows.map((row) => [row._id, row.count]))
}

export const orderProjectionSyncRoute = async (fastify: FastifyInstance) => {
  fastify.get(
    '/summary',
    { preHandler: shouldBeAdmin },
    async (_request, reply) => {
      const [inbox, outboxRows, oldestPending, rejected] = await Promise.all([
        countsByStatus(PaymentEventInbox),
        OrderOutboxEvent.aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        PaymentEventInbox.findOne({
          status: { $in: ['PENDING', 'PROCESSING'] },
        })
          .sort({ receivedAt: 1 })
          .select({ receivedAt: 1 })
          .lean(),
        RejectedPaymentEvent.countDocuments(),
      ])
      return reply.send({
        inbox,
        outbox: Object.fromEntries(
          outboxRows.map((row) => [row._id, row.count]),
        ),
        oldestPendingAt: oldestPending?.receivedAt?.toISOString() ?? null,
        rejectedEvents: rejected,
      })
    },
  )

  fastify.get<{ Params: { orderId: string } }>(
    '/:orderId',
    { preHandler: shouldBeAdmin },
    async (request, reply) => {
      const [order, inbox, outbox] = await Promise.all([
        Order.findOne({ orderId: request.params.orderId }).lean(),
        PaymentEventInbox.find({ orderId: request.params.orderId })
          .select({ payload: 0 })
          .sort({ receivedAt: -1 })
          .limit(20)
          .lean(),
        OrderOutboxEvent.find({ orderId: request.params.orderId })
          .select({ payload: 0 })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean(),
      ])
      if (!order && inbox.length === 0) {
        return reply.code(404).send({
          error: { code: 'ORDER_PROJECTION_NOT_FOUND' },
        })
      }
      return reply.send({ order, inbox, outbox })
    },
  )

  fastify.post<{ Params: { orderId: string } }>(
    '/:orderId/retry',
    { preHandler: shouldBeAdmin },
    async (request, reply) => {
      const result = await PaymentEventInbox.updateMany(
        { orderId: request.params.orderId, status: 'FAILED' },
        {
          $set: {
            status: 'PENDING',
            attempts: 0,
            nextAttemptAt: new Date(),
            leaseUntil: null,
            claimToken: null,
            lastError: null,
          },
        },
      )
      if (result.modifiedCount === 0) {
        return reply.code(404).send({
          error: { code: 'FAILED_ORDER_TASK_NOT_FOUND' },
        })
      }
      return reply.send({ resetJobs: result.modifiedCount })
    },
  )
}
