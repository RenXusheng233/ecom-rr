import type { CheckoutItemInput } from '@repo/types'

type CheckoutCatalogItem = {
  productId: string
  status: string
  desiredVersion: number
  appliedVersion: number | null
  stripePriceId: string | null
  desiredOperation: 'UPSERT' | 'ARCHIVE'
  desiredName: string | null
  desiredUnitAmount: number | null
  desiredCurrency: string | null
  desiredSizes: string[]
  desiredColors: string[]
}

export type CheckoutItemSnapshot = {
  productId: string
  name: string
  unitAmount: number
  currency: 'usd'
  stripePriceId: string
  quantity: number
  selectedSize: string
  selectedColor: string
}

export class CatalogSyncPendingError extends Error {
  readonly code = 'CATALOG_SYNC_PENDING'

  constructor(productId: string) {
    super(`Product ${productId} is not synchronized with Stripe`)
  }
}

export class InvalidCatalogOptionError extends Error {
  constructor(
    readonly code: 'INVALID_PRODUCT_SIZE' | 'INVALID_PRODUCT_COLOR',
    productId: string,
  ) {
    super(`Invalid catalog option for product ${productId}`)
  }
}

export const buildCheckoutSnapshot = (
  cart: CheckoutItemInput[],
  catalogItems: CheckoutCatalogItem[],
) => {
  const catalogByProduct = new Map(
    catalogItems.map((item) => [item.productId, item]),
  )

  const items = cart.map((cartItem): CheckoutItemSnapshot => {
    const { productId, quantity, selectedSize, selectedColor } = cartItem
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new Error(`Invalid quantity for product ${productId}`)
    }

    const item = catalogByProduct.get(productId)
    if (
      !item ||
      item.status !== 'SYNCED' ||
      item.desiredOperation !== 'UPSERT' ||
      item.appliedVersion !== item.desiredVersion ||
      !item.stripePriceId ||
      !item.desiredName ||
      !Number.isSafeInteger(item.desiredUnitAmount) ||
      (item.desiredUnitAmount ?? 0) < 0 ||
      item.desiredCurrency !== 'usd'
    ) {
      throw new CatalogSyncPendingError(productId)
    }
    if (!item.desiredSizes.includes(selectedSize)) {
      throw new InvalidCatalogOptionError('INVALID_PRODUCT_SIZE', productId)
    }
    if (!item.desiredColors.includes(selectedColor)) {
      throw new InvalidCatalogOptionError('INVALID_PRODUCT_COLOR', productId)
    }

    return {
      productId,
      name: item.desiredName,
      unitAmount: item.desiredUnitAmount as number,
      currency: 'usd',
      stripePriceId: item.stripePriceId,
      quantity,
      selectedSize,
      selectedColor,
    }
  })

  const amountTotal = items.reduce((total, item) => {
    const lineTotal = item.unitAmount * item.quantity
    if (
      !Number.isSafeInteger(lineTotal) ||
      !Number.isSafeInteger(total + lineTotal)
    ) {
      throw new Error('Checkout amount exceeds the safe integer range')
    }
    return total + lineTotal
  }, 0)

  return {
    lineItems: items.map(({ stripePriceId, quantity }) => ({
      price: stripePriceId,
      quantity,
    })),
    items,
    amountTotal,
    currency: 'usd' as const,
  }
}
