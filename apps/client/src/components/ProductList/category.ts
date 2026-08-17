export const ALL = 'all'
export const CATEGORY = 'category'

export const isAllCategory = (category?: string) =>
  category?.toLowerCase() === ALL

export const getCategoryQueryParam = (category?: string) =>
  category && !isAllCategory(category)
    ? `&${CATEGORY}=${encodeURIComponent(category)}`
    : ''
