import { topics } from '@repo/kafka'
import { prisma } from '@repo/product-db'
import type { CatalogSyncResultEvent } from '@repo/types'
import { consumer } from './kafka'

export const runKafkaSubscriptions = async () => {
  await consumer.subscribe([
    {
      topicName: topics.catalog_product_sync_result,
      errorPolicy: 'retry',
      topicHandler: async (message) => {
        const event = message as CatalogSyncResultEvent
        const productId = Number(event.productId)
        if (
          typeof event?.eventId !== 'string' ||
          typeof event.productId !== 'string' ||
          typeof event.occurredAt !== 'string' ||
          Number.isNaN(Date.parse(event.occurredAt)) ||
          !Number.isSafeInteger(productId) ||
          !Number.isSafeInteger(event.catalogVersion) ||
          event.catalogVersion < 1 ||
          !Number.isSafeInteger(event.resultRevision) ||
          event.resultRevision < 1 ||
          !['SYNCED', 'FAILED'].includes(event.status)
        ) {
          console.error('Rejected invalid catalog sync result')
          return
        }

        await prisma.product.updateMany({
          where: {
            id: productId,
            catalogVersion: event.catalogVersion,
            stripeSyncResultRevision: { lt: event.resultRevision },
          },
          data:
            event.status === 'SYNCED'
              ? {
                  stripeSyncStatus: 'SYNCED',
                  stripeSyncedVersion: event.catalogVersion,
                  stripeSyncedAt: new Date(event.occurredAt),
                  stripeSyncError: null,
                  stripeSyncResultRevision: event.resultRevision,
                }
              : {
                  stripeSyncStatus: 'FAILED',
                  stripeSyncError: event.error,
                  stripeSyncResultRevision: event.resultRevision,
                },
        })
      },
    },
  ])
}
