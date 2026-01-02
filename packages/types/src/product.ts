import { Product, Category } from '@repo/product-db'

export type ProductType = Product

export type StripeProductType = {
  id: string
  name: string
  price: number
}

export type CategoryType = Category
