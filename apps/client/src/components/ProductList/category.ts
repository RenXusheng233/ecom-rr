import { ALL_CATEGORIES_SLUG } from '@repo/types/category'

export const ALL = ALL_CATEGORIES_SLUG
export const CATEGORY = 'category'

export const isAllCategory = (category?: string) =>
  category?.toLowerCase() === ALL_CATEGORIES_SLUG

export const getCategoryQueryParam = (category?: string) =>
  category && !isAllCategory(category)
    ? `&${CATEGORY}=${encodeURIComponent(category)}`
    : ''
