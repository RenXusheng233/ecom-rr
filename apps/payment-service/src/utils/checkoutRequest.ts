import { createHash } from 'node:crypto'
import {
  checkoutRequestSchema,
  type CheckoutItemInput,
  type CheckoutRequest,
} from '@repo/types'

export type NormalizedCheckoutRequest = CheckoutRequest

const itemKey = (item: CheckoutItemInput) =>
  `${item.productId}\u0000${item.selectedSize}\u0000${item.selectedColor}`

export const normalizeCheckoutRequest = (
  value: CheckoutRequest,
): NormalizedCheckoutRequest => {
  const parsed = checkoutRequestSchema.parse(value)
  const items = new Map<string, CheckoutItemInput>()

  for (const item of parsed.cart) {
    const normalized = {
      productId: item.productId.trim(),
      quantity: item.quantity,
      selectedSize: item.selectedSize.trim(),
      selectedColor: item.selectedColor.trim(),
    }
    const key = itemKey(normalized)
    const current = items.get(key)
    const quantity = (current?.quantity ?? 0) + normalized.quantity
    if (!Number.isSafeInteger(quantity)) {
      throw new Error('Checkout quantity exceeds the safe integer range')
    }
    items.set(key, { ...normalized, quantity })
  }

  return {
    cart: [...items.values()].sort((left, right) =>
      itemKey(left).localeCompare(itemKey(right)),
    ),
  }
}

export const hashCheckoutRequest = (request: CheckoutRequest) =>
  createHash('sha256')
    .update(JSON.stringify(normalizeCheckoutRequest(request)))
    .digest('hex')
