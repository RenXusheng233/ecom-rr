import { topics } from '@repo/kafka'
import { paymentPrisma } from '@repo/payment-db'
import { producer } from './kafka'
import { randomUUID } from 'node:crypto'

const retryDelay = (attempt: number) =>
  Math.min(1000 * 2 ** Math.max(0, attempt - 1), 300000)

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const runPaymentOutboxBatch = async () => {
  const now = new Date()
  const events = await paymentPrisma.paymentOutboxEvent.findMany({
    where: {
      status: 'PENDING',
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { createdAt: 'asc' },
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
      await producer.send(
        topics.catalog_product_sync_result,
        event.payload as object,
        {
          key: event.aggregateId,
          headers: { eventType: 'catalog-sync-result' },
        },
      )
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
