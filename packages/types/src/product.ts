import { Product, Category } from '@repo/product-db'
import { z } from 'zod'
export type ProductType = Product

export type StripeProductType = {
  id: string
  name: string
  price: number
}

export type CategoryType = Category

export const CategoryFormSchema = z.object({
  name: z.string('Name is required!').min(1, 'Name is required!'),
  slug: z.string('Slug is required!').min(1, 'Slug is required!'),
})
