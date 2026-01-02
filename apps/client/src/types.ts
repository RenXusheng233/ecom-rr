import z from 'zod'
import { paymentFormSchema, shippingFormSchema } from './schemas'
import { CartItemType } from '@repo/types'

export type ShippingFormInputs = z.infer<typeof shippingFormSchema>

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
