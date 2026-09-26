export const catalogSyncOperations = ['UPSERT', 'ARCHIVE'] as const
export type CatalogSyncOperation = (typeof catalogSyncOperations)[number]

export const catalogSyncResultStatuses = ['SYNCED', 'FAILED'] as const
export type CatalogSyncResultStatus = (typeof catalogSyncResultStatuses)[number]

export type CatalogProductSnapshot = {
  name: string
  unitAmount: number
  currency: 'usd'
  sizes: string[]
  colors: string[]
}

export type CatalogSyncRequestedEvent = {
  eventId: string
  occurredAt: string
  productId: string
  catalogVersion: number
  operation: CatalogSyncOperation
  product: CatalogProductSnapshot | null
}

export type CatalogSyncResultEvent = {
  eventId: string
  causationId: string
  occurredAt: string
  productId: string
  catalogVersion: number
  resultRevision: number
  status: CatalogSyncResultStatus
  stripeProductId: string | null
  stripePriceId: string | null
  error: string | null
}
