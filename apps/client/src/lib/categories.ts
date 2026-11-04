import type { CategoryType } from '@repo/types'

export const fetchCategories = async (productServiceUrl: string) => {
  const response = await fetch(`${productServiceUrl}/categories`, {
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Failed to fetch categories')

  return (await response.json()) as CategoryType[]
}
