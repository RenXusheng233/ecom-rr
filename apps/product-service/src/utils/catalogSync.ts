import type {
  CatalogSyncOperation,
  CatalogSyncRequestedEvent,
} from '@repo/types'

type CatalogSyncEventInput = {
  eventId: string
  occurredAt: Date
  productId: number
  catalogVersion: number
  operation: CatalogSyncOperation
  name?: string
  price?: number
}

export const createCatalogSyncRequestedEvent = ({
  eventId,
  occurredAt,
  productId,
  catalogVersion,
  operation,
  name,
  price,
}: CatalogSyncEventInput): CatalogSyncRequestedEvent => {
  if (operation === 'UPSERT' && (name === undefined || price === undefined)) {
    throw new Error('UPSERT catalog events require a name and price')
  }

  return {
    eventId,
    occurredAt: occurredAt.toISOString(),
    productId: productId.toString(),
    catalogVersion,
    operation,
    product:
      operation === 'UPSERT'
        ? {
            name: name as string,
            unitAmount: (price as number) * 100,
            currency: 'usd',
          }
        : null,
  }
}

export const calculateOutboxRetryMs = (attempt: number) =>
  Math.min(1000 * 2 ** Math.max(0, attempt - 1), 300000)

export const isCurrentCatalogResult = (
  currentVersion: number,
  resultVersion: number,
) => currentVersion === resultVersion

export const shouldApplyCatalogResult = (
  currentVersion: number,
  resultVersion: number,
  currentRevision: number,
  resultRevision: number,
) => currentVersion === resultVersion && resultRevision > currentRevision
