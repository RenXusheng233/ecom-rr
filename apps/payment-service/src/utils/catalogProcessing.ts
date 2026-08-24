type CatalogTaskStatus = 'PENDING' | 'PROCESSING' | 'SYNCED' | 'FAILED'

export const incomingCatalogTaskState = (status: CatalogTaskStatus) =>
  status === 'PROCESSING'
    ? { status: 'PROCESSING' as const }
    : {
        status: 'PENDING' as const,
        attempts: 0,
        leaseUntil: null,
        claimToken: null,
        processingVersion: null,
        lastError: null,
      }

export const shouldFinalizeCatalogAttempt = (
  desiredVersion: number,
  processingVersion: number,
) => desiredVersion === processingVersion

export const attemptsForCatalogClaim = (
  processingVersion: number | null,
  desiredVersion: number,
  attempts: number,
) => (processingVersion === desiredVersion ? attempts : 0)
