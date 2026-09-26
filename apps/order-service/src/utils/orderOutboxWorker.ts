import { randomUUID } from 'node:crypto'
import { OrderOutboxEvent } from '@repo/order-db'
import { producer } from './kafka'
import { orderRetryAt } from './orderRetry'

const BATCH_SIZE = 50
const LEASE_MS = 30 * 1000

type PublishableOrderOutbox = {
  topic: string
  messageKey: string
  eventType: string
  schemaVersion: number
  payload: unknown
}

type OrderOutboxSender = (
  topic: string,
  message: object,
  options: { key: string; headers: Record<string, string> },
) => Promise<void>

export const publishOrderOutboxEvent = async (
  event: PublishableOrderOutbox,
  send: OrderOutboxSender,
) =>
  send(event.topic, event.payload as object, {
    key: event.messageKey,
    headers: {
      eventType: event.eventType,
      schemaVersion: event.schemaVersion.toString(),
    },
  })

const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000)

export const runOrderOutboxBatch = async () => {
  const now = new Date()
  const events = await OrderOutboxEvent.find({
    status: 'PENDING',
    nextAttemptAt: { $lte: now },
    $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
  })
    .sort({ orderId: 1, aggregateVersion: 1, createdAt: 1 })
    .limit(BATCH_SIZE)
    .lean()

  for (const event of events) {
    const claimToken = randomUUID()
    const claimNow = new Date()
    const claimed = await OrderOutboxEvent.updateOne(
      {
        eventId: event.eventId,
        status: 'PENDING',
        nextAttemptAt: { $lte: claimNow },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lt: claimNow } }],
      },
      {
        $set: {
          claimToken,
          leaseUntil: new Date(claimNow.getTime() + LEASE_MS),
        },
      },
    )
    if (claimed.modifiedCount === 0) continue

    try {
      await publishOrderOutboxEvent(event, producer.send)
      await OrderOutboxEvent.updateOne(
        { eventId: event.eventId, claimToken, status: 'PENDING' },
        {
          $set: {
            status: 'PUBLISHED',
            publishedAt: new Date(),
            leaseUntil: null,
            claimToken: null,
            lastError: null,
          },
        },
      )
    } catch (error) {
      const attempts = event.attempts + 1
      await OrderOutboxEvent.updateOne(
        { eventId: event.eventId, claimToken, status: 'PENDING' },
        {
          $set: {
            attempts,
            nextAttemptAt: orderRetryAt(attempts),
            leaseUntil: null,
            claimToken: null,
            lastError: errorMessage(error),
          },
        },
      )
    }
  }
}

export const startOrderOutboxWorker = () => {
  let running = false
  const poll = async () => {
    if (running) return
    running = true
    try {
      await runOrderOutboxBatch()
    } catch (error) {
      console.error('Order Outbox worker failed', error)
    } finally {
      running = false
    }
  }
  void poll()
  return setInterval(() => void poll(), 1000)
}
