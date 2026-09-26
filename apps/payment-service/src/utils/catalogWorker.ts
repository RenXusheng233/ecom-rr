import { randomUUID } from 'node:crypto'
import { topics } from '@repo/kafka'
import { paymentPrisma } from '@repo/payment-db'
import type { CatalogSyncResultEvent } from '@repo/types'
import { executeCatalogSyncAttempt } from './catalogAttempt'
import { attemptsForCatalogClaim } from './catalogProcessing'
import {
  getCatalogRetryDecision,
  shouldRotateSyncRunAfterFailure,
} from './catalogRetry'
import {
  archiveStripeCatalogItem,
  upsertStripeCatalogItem,
} from './stripeCatalog'

const BATCH_SIZE = 25
const LEASE_MS = 5 * 60 * 1000
const HEARTBEAT_MS = 30 * 1000

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

class CatalogClaimLostError extends Error {}

function createResultEvent(input: {
  causationId: string
  productId: string
  catalogVersion: number
  resultRevision: number
  status: 'SYNCED' | 'FAILED'
  stripeProductId: string | null
  stripePriceId: string | null
  error: string | null
}): CatalogSyncResultEvent {
  return {
    eventId: randomUUID(),
    causationId: input.causationId,
    occurredAt: new Date().toISOString(),
    productId: input.productId,
    catalogVersion: input.catalogVersion,
    resultRevision: input.resultRevision,
    status: input.status,
    stripeProductId: input.stripeProductId,
    stripePriceId: input.stripePriceId,
    error: input.error,
  }
}

const assertCatalogClaimActive = async (claim: {
  productId: string
  desiredVersion: number
  desiredRunId: string
  resultRevision: number
  mutationEpoch: number
  claimToken: string
}) => {
  const activeClaim = await paymentPrisma.stripeCatalogItem.count({
    where: {
      ...claim,
      processingVersion: claim.desiredVersion,
      status: 'PROCESSING',
    },
  })
  if (activeClaim === 0) {
    throw new CatalogClaimLostError(`Catalog claim lost for ${claim.productId}`)
  }
}

export const invalidateAfterStaleMutation = async (
  productId: string,
  staleClaimToken: string,
) => {
  await paymentPrisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "productId"
      FROM "StripeCatalogItem"
      WHERE "productId" = ${productId}
      FOR UPDATE
    `
    const current = await tx.stripeCatalogItem.findUnique({
      where: { productId },
    })
    if (!current) return

    const nextRunId = randomUUID()
    const nextResultRevision = current.resultRevision + 1
    const invalidationError =
      'Stripe state may have been changed by a stale worker'

    if (
      current.status === 'PROCESSING' &&
      current.claimToken !== staleClaimToken
    ) {
      await tx.stripeCatalogItem.update({
        where: { productId },
        data: {
          mutationEpoch: { increment: 1 },
          desiredRunId: nextRunId,
          resultRevision: { increment: 1 },
          lastError: invalidationError,
        },
      })
    } else {
      await tx.stripeCatalogItem.update({
        where: { productId },
        data: {
          mutationEpoch: { increment: 1 },
          desiredRunId: nextRunId,
          resultRevision: { increment: 1 },
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseUntil: null,
          claimToken: null,
          processingVersion: null,
          lastError: invalidationError,
        },
      })
    }

    const result = createResultEvent({
      causationId: current.desiredEventId,
      productId,
      catalogVersion: current.desiredVersion,
      resultRevision: nextResultRevision,
      status: 'FAILED',
      stripeProductId: current.stripeProductId,
      stripePriceId: current.stripePriceId,
      error: invalidationError,
    })
    await tx.paymentOutboxEvent.create({
      data: {
        id: result.eventId,
        aggregateId: productId,
        aggregateVersion: current.desiredVersion,
        topic: topics.catalog_product_sync_result,
        messageKey: productId,
        eventType: topics.catalog_product_sync_result,
        schemaVersion: 1,
        payload: result,
      },
    })
  })
}

export const runCatalogSyncBatch = async () => {
  const batchStartedAt = new Date()
  const items = await paymentPrisma.stripeCatalogItem.findMany({
    where: {
      status: { in: ['PENDING', 'PROCESSING'] },
      nextAttemptAt: { lte: batchStartedAt },
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: batchStartedAt } }],
    },
    orderBy: { updatedAt: 'asc' },
    take: BATCH_SIZE,
  })

  for (const item of items) {
    const claimNow = new Date()
    const claimToken = randomUUID()
    const attempts = attemptsForCatalogClaim(
      item.processingVersion,
      item.desiredVersion,
      item.attempts,
    )
    const claimed = await paymentPrisma.stripeCatalogItem.updateMany({
      where: {
        productId: item.productId,
        desiredVersion: item.desiredVersion,
        desiredRunId: item.desiredRunId,
        resultRevision: item.resultRevision,
        mutationEpoch: item.mutationEpoch,
        status: { in: ['PENDING', 'PROCESSING'] },
        nextAttemptAt: { lte: claimNow },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: claimNow } }],
      },
      data: {
        status: 'PROCESSING',
        processingVersion: item.desiredVersion,
        claimToken,
        attempts,
        leaseUntil: new Date(claimNow.getTime() + LEASE_MS),
      },
    })
    if (claimed.count === 0) continue

    const heartbeat = setInterval(() => {
      void paymentPrisma.stripeCatalogItem
        .updateMany({
          where: { productId: item.productId, claimToken },
          data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
        })
        .catch((error) =>
          console.error('Catalog lease heartbeat failed', error),
        )
    }, HEARTBEAT_MS)
    heartbeat.unref()

    const claimWhere = {
      productId: item.productId,
      desiredVersion: item.desiredVersion,
      desiredRunId: item.desiredRunId,
      resultRevision: item.resultRevision,
      mutationEpoch: item.mutationEpoch,
      processingVersion: item.desiredVersion,
      claimToken,
      status: 'PROCESSING' as const,
    }
    const assertClaimActive = () => assertCatalogClaimActive(claimWhere)

    try {
      await executeCatalogSyncAttempt({
        runStripeOperation: async () =>
          item.desiredOperation === 'UPSERT'
            ? upsertStripeCatalogItem({
                ...item,
                syncRunId: item.desiredRunId,
                assertClaimActive,
              })
            : archiveStripeCatalogItem(
                item.productId,
                item.desiredVersion,
                item.desiredRunId,
                assertClaimActive,
              ),
        persistSuccess: async (stripeResult) => {
          const finalized = await paymentPrisma.$transaction(async (tx) => {
            const updated = await tx.stripeCatalogItem.updateMany({
              where: claimWhere,
              data: {
                status: 'SYNCED',
                appliedVersion: item.desiredVersion,
                stripeProductId: stripeResult.stripeProductId,
                stripePriceId: stripeResult.stripePriceId,
                attempts: 0,
                leaseUntil: null,
                claimToken: null,
                processingVersion: null,
                lastError: null,
                syncedAt: new Date(),
                resultRevision: { increment: 1 },
              },
            })
            if (updated.count === 0) return false

            const persisted = await tx.stripeCatalogItem.findUniqueOrThrow({
              where: { productId: item.productId },
            })
            const result = createResultEvent({
              causationId: item.desiredEventId,
              productId: item.productId,
              catalogVersion: item.desiredVersion,
              resultRevision: persisted.resultRevision,
              status: 'SYNCED',
              stripeProductId: stripeResult.stripeProductId,
              stripePriceId: stripeResult.stripePriceId,
              error: null,
            })
            await tx.paymentOutboxEvent.create({
              data: {
                id: result.eventId,
                aggregateId: item.productId,
                aggregateVersion: item.desiredVersion,
                topic: topics.catalog_product_sync_result,
                messageKey: item.productId,
                eventType: topics.catalog_product_sync_result,
                schemaVersion: 1,
                payload: result,
              },
            })
            return true
          })

          if (!finalized) {
            await invalidateAfterStaleMutation(item.productId, claimToken)
          }
        },
        handleStripeFailure: async (error) => {
          const attempt = attempts + 1
          const message = errorMessage(error)
          const decision = getCatalogRetryDecision(error, attempt)

          if (decision.retry && decision.nextAttemptAt) {
            const updated = await paymentPrisma.stripeCatalogItem.updateMany({
              where: claimWhere,
              data: {
                status: 'PENDING',
                ...(shouldRotateSyncRunAfterFailure(error)
                  ? { desiredRunId: randomUUID() }
                  : {}),
                attempts: attempt,
                nextAttemptAt: decision.nextAttemptAt,
                leaseUntil: null,
                claimToken: null,
                processingVersion: item.desiredVersion,
                lastError: message,
              },
            })
            if (updated.count === 0) {
              await invalidateAfterStaleMutation(item.productId, claimToken)
            }
            return
          }

          const finalized = await paymentPrisma.$transaction(async (tx) => {
            const updated = await tx.stripeCatalogItem.updateMany({
              where: claimWhere,
              data: {
                status: 'FAILED',
                attempts: attempt,
                leaseUntil: null,
                claimToken: null,
                processingVersion: null,
                lastError: message,
                resultRevision: { increment: 1 },
              },
            })
            if (updated.count === 0) return false

            const persisted = await tx.stripeCatalogItem.findUniqueOrThrow({
              where: { productId: item.productId },
            })
            const result = createResultEvent({
              causationId: item.desiredEventId,
              productId: item.productId,
              catalogVersion: item.desiredVersion,
              resultRevision: persisted.resultRevision,
              status: 'FAILED',
              stripeProductId: item.stripeProductId,
              stripePriceId: item.stripePriceId,
              error: message,
            })
            await tx.paymentOutboxEvent.create({
              data: {
                id: result.eventId,
                aggregateId: item.productId,
                aggregateVersion: item.desiredVersion,
                topic: topics.catalog_product_sync_result,
                messageKey: item.productId,
                eventType: topics.catalog_product_sync_result,
                schemaVersion: 1,
                payload: result,
              },
            })
            return true
          })

          if (!finalized) {
            await invalidateAfterStaleMutation(item.productId, claimToken)
          }
        },
      })
    } finally {
      clearInterval(heartbeat)
    }
  }
}

export const startCatalogSyncWorker = () => {
  let running = false
  const poll = async () => {
    if (running) return
    running = true
    try {
      await runCatalogSyncBatch()
    } catch (error) {
      console.error('Catalog sync worker failed', error)
    } finally {
      running = false
    }
  }

  void poll()
  return setInterval(() => void poll(), 1000)
}
