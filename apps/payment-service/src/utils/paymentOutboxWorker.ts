import { paymentPrisma } from '@repo/payment-db'
import { producer } from './kafka'
import { randomUUID } from 'node:crypto'

const retryDelay = (attempt: number) =>
  Math.min(1000 * 2 ** Math.max(0, attempt - 1), 300000) +
  Math.floor(Math.random() * 1000)

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

type PublishableOutboxEvent = {
  topic: string
  messageKey: string
  eventType: string
  schemaVersion: number
  payload: unknown
}

type OutboxSender = (
  topic: string,
  message: object,
  options: { key: string; headers: Record<string, string> },
) => Promise<void>

export const publishPaymentOutboxEvent = async (
  event: PublishableOutboxEvent,
  send: OutboxSender,
) =>
  send(event.topic, event.payload as object, {
    key: event.messageKey,
    headers: {
      eventType: event.eventType,
      schemaVersion: event.schemaVersion.toString(),
    },
  })

export const runPaymentOutboxBatch = async () => {
  const now = new Date()
  const events = await paymentPrisma.paymentOutboxEvent.findMany({
    where: {
      status: 'PENDING',
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: [
      { aggregateId: 'asc' },
      { aggregateVersion: 'asc' },
      { createdAt: 'asc' },
    ],
    take: 50,
  })

  for (const event of events) {
    const claimNow = new Date()
    const claimToken = randomUUID()
    const claimed = await paymentPrisma.paymentOutboxEvent.updateMany({
      where: {
        id: event.id,
        status: 'PENDING',
        nextAttemptAt: { lte: claimNow },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: claimNow } }],
      },
      data: {
        claimToken,
        leaseUntil: new Date(claimNow.getTime() + 30000),
      },
    })
    if (claimed.count === 0) continue

    try {
      await publishPaymentOutboxEvent(event, producer.send)
      await paymentPrisma.paymentOutboxEvent.updateMany({
        where: { id: event.id, claimToken },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          leaseUntil: null,
          claimToken: null,
          lastError: null,
        },
      })
    } catch (error) {
      const attempt = event.attempts + 1
      await paymentPrisma.paymentOutboxEvent.updateMany({
        where: { id: event.id, claimToken },
        data: {
          attempts: attempt,
          nextAttemptAt: new Date(Date.now() + retryDelay(attempt)),
          leaseUntil: null,
          claimToken: null,
          lastError: errorMessage(error),
        },
      })
    }
  }
}

export const startPaymentOutboxWorker = () => {
  let running = false
  const poll = async () => {
    if (running) return
    running = true
    try {
      await runPaymentOutboxBatch()
    } catch (error) {
      console.error('Payment outbox worker failed', error)
    } finally {
      running = false
    }
  }

  void poll()
  return setInterval(() => void poll(), 1000)
}
