import { ReactElement } from 'react'
import z from 'zod'
import { paymentFormSchema, shippingFormSchema } from './schemas'

export const ALL = 'all'
export const CATEGORY = 'category'
export const SORT = 'sort'
export const STEP = 'step'
export const SIZE = 'size'
export const COLOR = 'color'

export type Category = {
  name: string
  icon: ReactElement
  slug: string
}

export type ProductType = {
  id: number | string
  name: string
  shortDescription: string
  description: string
  price: number
  sizes: string[]
  colors: string[]
  images: Record<string, string>
}

export type CartItemType = ProductType & {
  quantity: number
  selectedSize: string
  selectedColor: string
}

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
