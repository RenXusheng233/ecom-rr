import z from 'zod'
import { paymentFormSchema, shippingFormSchema } from './schemas'
import type { CartItemType, CheckoutRequest } from '@repo/types'
import type { StripeCheckoutContact } from '@stripe/stripe-js'

export const CHECKOUT_IDEMPOTENCY_STORAGE_KEY = 'checkout-idempotency-key'
export const CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY =
  'checkout-idempotency-fingerprint'

export const toCheckoutRequest = (cart: CartItemType[]): CheckoutRequest => ({
  cart: cart
    .map((item) => ({
      productId: item.id.toString(),
      quantity: item.quantity,
      selectedSize: item.selectedSize,
      selectedColor: item.selectedColor,
    }))
    .sort((left, right) =>
      `${left.productId}\u0000${left.selectedSize}\u0000${left.selectedColor}`.localeCompare(
        `${right.productId}\u0000${right.selectedSize}\u0000${right.selectedColor}`,
      ),
    ),
})

export type ShippingFormInputs = z.infer<typeof shippingFormSchema>

export const toStripeShippingAddress = ({
  name,
  address,
  city,
  postalCode,
  country,
}: ShippingFormInputs): StripeCheckoutContact => ({
  name,
  address: {
    line1: address,
    city,
    postal_code: postalCode,
    country,
  },
})

export type PaymentFormInputs = z.infer<typeof paymentFormSchema>

export type CartStoreStateType = {
  hasHydrated: boolean
  cart: CartItemType[]
}

export type CartStoreActionsType = {
  addToCart: (product: CartItemType) => void
  removeFromCart: (product: CartItemType) => void
  clearCart: () => void
}
