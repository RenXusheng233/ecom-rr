export const shouldApplyCatalogEvent = (
  currentVersion: number | null,
  incomingVersion: number,
) => currentVersion === null || incomingVersion > currentVersion
