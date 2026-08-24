type CheckoutCartItem = {
  id: number
  quantity: number
}

type CheckoutCatalogItem = {
  productId: string
  status: string
  desiredVersion: number
  appliedVersion: number | null
  stripePriceId: string | null
  desiredOperation: 'UPSERT' | 'ARCHIVE'
}

export class CatalogSyncPendingError extends Error {
  readonly code = 'CATALOG_SYNC_PENDING'

  constructor(productId: number) {
    super(`Product ${productId} is not synchronized with Stripe`)
  }
}

export const buildCheckoutLineItems = (
  cart: CheckoutCartItem[],
  catalogItems: CheckoutCatalogItem[],
) => {
  const catalogByProduct = new Map(
    catalogItems.map((item) => [item.productId, item]),
  )

  return cart.map(({ id, quantity }) => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error(`Invalid quantity for product ${id}`)
    }

    const item = catalogByProduct.get(id.toString())
    if (
      !item ||
      item.status !== 'SYNCED' ||
      item.desiredOperation !== 'UPSERT' ||
      item.appliedVersion !== item.desiredVersion ||
      !item.stripePriceId
    ) {
      throw new CatalogSyncPendingError(id)
    }

    return { price: item.stripePriceId, quantity }
  })
}

export const buildCheckoutLineItemsWithFallback = async (
  cart: CheckoutCartItem[],
  catalogItems: CheckoutCatalogItem[],
  enforcementEnabled: boolean,
  resolveLegacyPrice: (productId: string) => Promise<string | null>,
) => {
  const catalogByProduct = new Map(
    catalogItems.map((item) => [item.productId, item]),
  )

  return Promise.all(
    cart.map(async ({ id, quantity }) => {
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error(`Invalid quantity for product ${id}`)
      }

      const item = catalogByProduct.get(id.toString())
      if (
        item?.status === 'SYNCED' &&
        item.desiredOperation === 'UPSERT' &&
        item.appliedVersion === item.desiredVersion &&
        item.stripePriceId
      ) {
        return { price: item.stripePriceId, quantity }
      }

      if (!enforcementEnabled) {
        const legacyPriceId = await resolveLegacyPrice(id.toString())
        if (legacyPriceId) return { price: legacyPriceId, quantity }
      }

      throw new CatalogSyncPendingError(id)
    }),
  )
}
