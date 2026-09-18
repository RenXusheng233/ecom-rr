export const needsCatalogOptionBackfill = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return true

  const product = (payload as { product?: unknown }).product
  if (!product || typeof product !== 'object') return true

  const { sizes, colors } = product as {
    sizes?: unknown
    colors?: unknown
  }

  return (
    !Array.isArray(sizes) ||
    sizes.length === 0 ||
    !Array.isArray(colors) ||
    colors.length === 0
  )
}
