import { topics } from '@repo/kafka'
import { consumer } from './kafka'
import { paymentPrisma } from '@repo/payment-db'
import type { CatalogSyncRequestedEvent } from '@repo/types'
import { shouldApplyCatalogEvent } from './catalogEvent'
import { incomingCatalogTaskState } from './catalogProcessing'

const validateEvent = (message: unknown): CatalogSyncRequestedEvent => {
  const event = message as CatalogSyncRequestedEvent
  if (
    typeof event?.eventId !== 'string' ||
    !event.eventId ||
    typeof event.productId !== 'string' ||
    !event.productId ||
    typeof event.occurredAt !== 'string' ||
    Number.isNaN(Date.parse(event.occurredAt)) ||
    !Number.isSafeInteger(event.catalogVersion) ||
    event.catalogVersion < 1 ||
    !['UPSERT', 'ARCHIVE'].includes(event.operation)
  ) {
    throw new Error('Invalid catalog sync event')
  }
  if (
    event.operation === 'UPSERT' &&
    (!event.product ||
      !event.product.name?.trim() ||
      event.product.currency !== 'usd' ||
      !Number.isSafeInteger(event.product.unitAmount) ||
      event.product.unitAmount < 1)
  ) {
    throw new Error('UPSERT catalog sync event has invalid product data')
  }
  if (event.operation === 'ARCHIVE' && event.product !== null) {
    throw new Error('ARCHIVE catalog sync event must contain a tombstone')
  }
  return event
}

export const runKafkaSubscriptions = async () => {
  await consumer.subscribe([
    {
      topicName: topics.catalog_product_sync_requested,
      errorPolicy: 'retry',
      topicHandler: async (message) => {
        let event: CatalogSyncRequestedEvent
        try {
          event = validateEvent(message)
        } catch (error) {
          console.error('Rejected invalid catalog sync event', error)
          return
        }

        await paymentPrisma.$transaction(async (tx) => {
          const existingEvent = await tx.catalogInboxEvent.findUnique({
            where: { id: event.eventId },
          })
          if (existingEvent) return

          await tx.catalogInboxEvent.create({
            data: { id: event.eventId, productId: event.productId },
          })

          const current = await tx.stripeCatalogItem.findUnique({
            where: { productId: event.productId },
          })
          if (
            !shouldApplyCatalogEvent(
              current?.desiredVersion ?? null,
              event.catalogVersion,
            )
          ) {
            return
          }

          await tx.stripeCatalogItem.upsert({
            where: { productId: event.productId },
            create: {
              productId: event.productId,
              desiredEventId: event.eventId,
              desiredVersion: event.catalogVersion,
              desiredOperation: event.operation,
              desiredName: event.product?.name,
              desiredUnitAmount: event.product?.unitAmount,
              desiredCurrency: event.product?.currency,
              desiredRunId: event.eventId,
              status: 'PENDING',
            },
            update: {
              desiredEventId: event.eventId,
              desiredVersion: event.catalogVersion,
              desiredOperation: event.operation,
              desiredName: event.product?.name,
              desiredUnitAmount: event.product?.unitAmount,
              desiredCurrency: event.product?.currency,
              desiredRunId: event.eventId,
              ...incomingCatalogTaskState(current?.status ?? 'PENDING'),
              ...(current?.status === 'PROCESSING'
                ? {}
                : { nextAttemptAt: new Date() }),
            },
          })
        })
      },
    },
  ])
}
