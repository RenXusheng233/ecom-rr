import { randomUUID } from 'node:crypto'
import { topics } from '@repo/kafka'
import {
  Order,
  OrderOutboxEvent,
  PaymentEventInbox,
  startOrderDbSession,
} from '@repo/order-db'
import {
  paymentOrderEventSchema,
  type OrderPaymentAppliedEvent,
  type PaymentOrderEvent,
} from '@repo/types'
import { decideOrderProjection, type OrderProjection } from './orderProjection'
import { orderRetryAt } from './orderRetry'

const BATCH_SIZE = 25
const LEASE_MS = 5 * 60 * 1000
const HEARTBEAT_MS = 30 * 1000
const MAX_ATTEMPTS = 8

class OrderClaimLostError extends Error {}

type AckSource = Pick<
  PaymentOrderEvent,
  'id' | 'aggregateId' | 'aggregateVersion' | 'correlationId'
>

export const createOrderAppliedEvent = (
  source: AckSource,
  orderExists: boolean,
  options: { eventId?: string; occurredAt?: string } = {},
): OrderPaymentAppliedEvent => {
  const occurredAt = options.occurredAt ?? new Date().toISOString()
  return {
    id: options.eventId ?? randomUUID(),
    type: 'order.payment.applied',
    schemaVersion: 1,
    occurredAt,
    aggregateId: source.aggregateId,
    aggregateVersion: source.aggregateVersion,
    correlationId: source.correlationId,
    causationId: source.id,
    data: {
      orderId: source.aggregateId,
      paymentAttemptId: source.correlationId,
      appliedVersion: source.aggregateVersion,
      orderExists,
      appliedAt: occurredAt,
    },
  }
}

const processClaimedInbox = async (eventId: string, claimToken: string) => {
  const session = await startOrderDbSession()
  try {
    await session.withTransaction(async () => {
      const inbox = await PaymentEventInbox.findOne({
        eventId,
        claimToken,
        status: 'PROCESSING',
      })
        .session(session)
        .lean()
      if (!inbox) throw new OrderClaimLostError()

      const event = paymentOrderEventSchema.parse(
        inbox.payload,
      ) as PaymentOrderEvent
      const storedOrder = await Order.findOne({ orderId: event.aggregateId })
        .session(session)
        .lean()
      const current = storedOrder
        ? ({
            orderId: storedOrder.orderId,
            paymentAttemptId: storedOrder.paymentAttemptId,
            stripeCheckoutSessionId: storedOrder.stripeCheckoutSessionId,
            stripePaymentIntentId: storedOrder.stripePaymentIntentId,
            paymentVersion: storedOrder.paymentVersion,
            paymentStatus: storedOrder.paymentStatus,
            refundStatus: storedOrder.refundStatus,
            disputeStatus: storedOrder.disputeStatus,
            userId: storedOrder.userId,
            email: storedOrder.email,
            amountTotal: storedOrder.amountTotal,
            amountRefunded: storedOrder.amountRefunded,
            currency: storedOrder.currency,
            products: storedOrder.products,
            shipping: storedOrder.shipping,
          } as OrderProjection)
        : null
      const projection = decideOrderProjection(current, event)

      if (projection.apply && projection.next) {
        await Order.updateOne(
          { orderId: event.aggregateId },
          { $set: projection.next },
          { upsert: !storedOrder, session },
        )
      }

      const completed = await PaymentEventInbox.updateOne(
        { eventId, claimToken, status: 'PROCESSING' },
        {
          $set: {
            status: 'PROCESSED',
            processedAt: new Date(),
            leaseUntil: null,
            claimToken: null,
            lastError: null,
          },
        },
        { session },
      )
      if (completed.modifiedCount === 0) throw new OrderClaimLostError()

      const orderExists = Boolean(storedOrder || projection.next)
      const ack = createOrderAppliedEvent(event, orderExists)
      await OrderOutboxEvent.create(
        [
          {
            eventId: ack.id,
            orderId: ack.aggregateId,
            aggregateVersion: ack.aggregateVersion,
            topic: topics.order_payment_applied,
            messageKey: ack.aggregateId,
            eventType: ack.type,
            schemaVersion: ack.schemaVersion,
            payload: ack,
          },
        ],
        { session },
      )
    })
  } finally {
    await session.endSession()
  }
}

const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000)

export const runOrderInboxBatch = async () => {
  const now = new Date()
  const jobs = await PaymentEventInbox.find({
    status: { $in: ['PENDING', 'PROCESSING'] },
    nextAttemptAt: { $lte: now },
    $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
  })
    .sort({ receivedAt: 1 })
    .limit(BATCH_SIZE)
    .lean()

  for (const job of jobs) {
    const claimToken = randomUUID()
    const claimNow = new Date()
    const claimed = await PaymentEventInbox.updateOne(
      {
        eventId: job.eventId,
        status: { $in: ['PENDING', 'PROCESSING'] },
        nextAttemptAt: { $lte: claimNow },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lt: claimNow } }],
      },
      {
        $set: {
          status: 'PROCESSING',
          claimToken,
          leaseUntil: new Date(claimNow.getTime() + LEASE_MS),
        },
      },
    )
    if (claimed.modifiedCount === 0) continue

    const heartbeat = setInterval(() => {
      void PaymentEventInbox.updateOne(
        { eventId: job.eventId, claimToken, status: 'PROCESSING' },
        { $set: { leaseUntil: new Date(Date.now() + LEASE_MS) } },
      ).catch((error) =>
        console.error('Order Inbox lease heartbeat failed', error),
      )
    }, HEARTBEAT_MS)
    heartbeat.unref()

    try {
      await processClaimedInbox(job.eventId, claimToken)
    } catch (error) {
      if (!(error instanceof OrderClaimLostError)) {
        const attempts = job.attempts + 1
        await PaymentEventInbox.updateOne(
          { eventId: job.eventId, claimToken, status: 'PROCESSING' },
          attempts >= MAX_ATTEMPTS
            ? {
                $set: {
                  status: 'FAILED',
                  attempts,
                  leaseUntil: null,
                  claimToken: null,
                  lastError: errorMessage(error),
                },
              }
            : {
                $set: {
                  status: 'PENDING',
                  attempts,
                  nextAttemptAt: orderRetryAt(attempts),
                  leaseUntil: null,
                  claimToken: null,
                  lastError: errorMessage(error),
                },
              },
        )
      }
    } finally {
      clearInterval(heartbeat)
    }
  }
}

export const startOrderInboxWorker = () => {
  let running = false
  const poll = async () => {
    if (running) return
    running = true
    try {
      await runOrderInboxBatch()
    } catch (error) {
      console.error('Order Inbox worker failed', error)
    } finally {
      running = false
    }
  }
  void poll()
  return setInterval(() => void poll(), 1000)
}
