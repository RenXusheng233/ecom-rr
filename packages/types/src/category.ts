export const ALL_CATEGORIES_SLUG = 'all'

export const CATEGORY_PRESETS = [
  'T-shirts',
  'Shoes',
  'Accessories',
  'Bags',
  'Dresses',
  'Jackets',
  'Gloves',
] as const

const nonSlugCharacters = new RegExp('[^\\p{L}\\p{N}]+', 'gu')

export const createCategorySlug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(nonSlugCharacters, '-')
    .replace(/^-+|-+$/g, '')
