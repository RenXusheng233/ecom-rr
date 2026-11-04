import { Product, Category } from '@repo/product-db'
import { z } from 'zod'
export type ProductType = Product

export type StripeProductType = {
  id: string
  name: string
  price: number
}

export type CategoryType = Category

export type AdminCategoryType = CategoryType & { productCount: number }

export const CategoryFormSchema = z.object({
  name: z.string('Name is required!').trim().min(1, 'Name is required!'),
  slug: z.string('Slug is required!').trim().min(1, 'Slug is required!'),
})

export const COLORS = [
  'blue',
  'green',
  'red',
  'yellow',
  'purple',
  'orange',
  'pink',
  'brown',
  'gray',
  'black',
  'white',
] as const

export const SIZES = [
  'xs',
  's',
  'm',
  'l',
  'xl',
  'xxl',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
] as const

const ProductFieldsSchema = z.strictObject({
  name: z
    .string('Product name is required!')
    .min(1, 'Product name is required!'),
  shortDescription: z
    .string('Short description is required!')
    .min(1, 'Short description is required!')
    .max(60),
  description: z
    .string('Description is required!')
    .min(1, 'Description is required!'),
  price: z
    .number('Price is required!')
    .int('Price must be a whole number!')
    .min(1, 'Price is required!')
    .max(2147483647),
  categorySlug: z
    .string('Category is required!')
    .min(1, 'Category is required!'),
  colors: z.array(z.enum(COLORS)).min(1, 'At least one color is required!'),
  sizes: z.array(z.enum(SIZES)).min(1, 'At least one size is required!'),
  images: z.record(z.string(), z.string(), 'Image for each color is required!'),
})

export const ProductUpdateSchema = ProductFieldsSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  'No product fields provided',
)

export const ProductFormSchema = ProductFieldsSchema.refine(
  (data) => {
    const missingImages = data.colors.filter((color) => !data.images[color])
    return missingImages.length === 0
  },
  {
    message: 'Image for each color is required!',
    path: ['images'],
  },
)
