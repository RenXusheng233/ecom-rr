'use client'

import {
  Footprints,
  Glasses,
  Briefcase,
  Shirt,
  ShoppingBasket,
  Hand,
  Venus,
  type LucideIcon,
} from 'lucide-react'
import type { CategoryType } from '@repo/types'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ALL, CATEGORY, isAllCategory } from './category'

const categoryIcons = new Map<string, LucideIcon>([
  ['t-shirts', Shirt],
  ['shoes', Footprints],
  ['accessories', Glasses],
  ['bags', Briefcase],
  ['dresses', Venus],
  ['jackets', Shirt],
  ['gloves', Hand],
])

const Categories = ({ categories }: { categories: CategoryType[] }) => {
  const searchParams = useSearchParams()
  const currentCategory = searchParams.get(CATEGORY)
  const selectedCategory =
    !currentCategory || isAllCategory(currentCategory) ? ALL : currentCategory
  const router = useRouter()
  const pathname = usePathname()
  const filters = [
    { name: ALL, Icon: ShoppingBasket, slug: ALL },
    ...categories
      .filter(({ slug }) => !isAllCategory(slug))
      .map(({ name, slug }) => ({
        name,
        Icon: categoryIcons.get(slug.toLowerCase()) ?? ShoppingBasket,
        slug,
      })),
  ]

  const handleClick = (val: string) => {
    const params = new URLSearchParams(searchParams)
    params.set(CATEGORY, val)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 bg-gray-200 p-2 mb-4 text-sm rounded-lg">
      {filters.map(({ name, Icon, slug }) => (
        <button
          type="button"
          aria-pressed={slug === selectedCategory}
          className={`flex items-center justify-center gap-2 cursor-pointer px-2 py-1 rounded-md
                      ${slug === selectedCategory ? 'bg-white' : 'text-gray-500'}`}
          key={slug}
          onClick={() => handleClick(slug)}
        >
          <Icon className="w-4 h-4" />
          {name}
        </button>
      ))}
    </div>
  )
}

export default Categories
