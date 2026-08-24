type DesiredCatalogState = {
  operation: 'UPSERT' | 'ARCHIVE'
  name: string | null
  unitAmount: number | null
  catalogVersion: number
}

export type StripeCatalogState = {
  exists: boolean
  active: boolean
  defaultPriceActive: boolean
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
    actual.name !== desired.name ||
    actual.unitAmount !== desired.unitAmount ||
    actual.catalogVersion !== desired.catalogVersion
  )
}
