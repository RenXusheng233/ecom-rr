type DesiredCatalogState = {
  operation: 'UPSERT' | 'ARCHIVE'
  name: string | null
  unitAmount: number | null
  catalogVersion: number
  stripePriceId: string | null
}

export type StripeCatalogState = {
  exists: boolean
  active: boolean
  defaultPriceActive: boolean
  defaultPriceId: string | null
  activePriceCount: number
  name: string | null
  unitAmount: number | null
  catalogVersion: number | null
}

export const hasCatalogDrift = (
  desired: DesiredCatalogState,
  actual: StripeCatalogState,
) => {
  if (desired.operation === 'ARCHIVE') {
    return actual.exists && (actual.active || actual.activePriceCount > 0)
  }

  return (
    !actual.exists ||
    !actual.active ||
    !actual.defaultPriceActive ||
    actual.defaultPriceId !== desired.stripePriceId ||
    actual.name !== desired.name ||
    actual.unitAmount !== desired.unitAmount ||
    actual.catalogVersion !== desired.catalogVersion
  )
}
