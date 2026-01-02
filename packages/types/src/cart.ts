import { Product } from '@repo/product-db'

export type CartItemType = Product & {
  quantity: number
  selectedSize: string
  selectedColor: string
}
