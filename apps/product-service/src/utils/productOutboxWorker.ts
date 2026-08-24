import { topics } from '@repo/kafka'
import { prisma } from '@repo/product-db'
import { dispatchCatalogOutboxEvent } from './catalogOutbox'
import { producer } from './kafka'
import { randomUUID } from 'node:crypto'

const BATCH_SIZE = 50
const LEASE_MS = 30000

export const runProductOutboxBatch = async () => {
  const now = new Date()
  const events = await prisma.productOutboxEvent.findMany({
    where: {
      status: 'PENDING',
      nextAttemptAt: { lte: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
  })

  for (const event of events) {
    const claimNow = new Date()
    const claimToken = randomUUID()
    const claimed = await prisma.productOutboxEvent.updateMany({
      where: {
        id: event.id,
        status: 'PENDING',
        nextAttemptAt: { lte: claimNow },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: claimNow } }],
      },
      data: {
        claimToken,
        leaseUntil: new Date(claimNow.getTime() + LEASE_MS),
      },
    })

    if (claimed.count === 0) continue

    await dispatchCatalogOutboxEvent(
      {
        id: event.id,
        aggregateId: event.aggregateId,
        attempts: event.attempts,
        payload: event.payload as object,
      },
      {
        publish: async (outboxEvent) => {
          await producer.send(
            topics.catalog_product_sync_requested,
            outboxEvent.payload,
            {
              key: outboxEvent.aggregateId,
              headers: { eventType: 'catalog-sync-requested' },
            },
          )
        },
        markPublished: async (eventId) => {
          await prisma.productOutboxEvent.updateMany({
            where: { id: eventId, claimToken },
            data: {
              status: 'PUBLISHED',
              publishedAt: new Date(),
              leaseUntil: null,
              claimToken: null,
              lastError: null,
            },
          })
        },
        markFailedAttempt: async ({ eventId, nextAttemptAt, error }) => {
          await prisma.productOutboxEvent.updateMany({
            where: { id: eventId, claimToken },
            data: {
              attempts: { increment: 1 },
              nextAttemptAt,
              leaseUntil: null,
              claimToken: null,
              lastError: error,
            },
          })
        },
        now: () => new Date(),
      },
    )
  }
}

export const startProductOutboxWorker = () => {
  let running = false
  const poll = async () => {
    if (running) return
    running = true
    try {
      await runProductOutboxBatch()
    } catch (error) {
      console.error('Product outbox worker failed', error)
    } finally {
      running = false
    }
  }

  void poll()
  return setInterval(() => void poll(), 1000)
}
