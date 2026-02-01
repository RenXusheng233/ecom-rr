'use client'

import { ReactElement } from 'react'
import {
  Footprints,
  Glasses,
  Briefcase,
  Shirt,
  ShoppingBasket,
  Hand,
  Venus,
} from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

export const ALL = 'all'
export const CATEGORY = 'category'

type Category = {
  name: string
  icon: ReactElement
  slug: string
}

enum CategorySlug {
  ALL = 'All',
  T_SHIRTS = 'T-shirts',
  SHOES = 'Shoes',
  ACCESSORIES = 'Accessories',
  BAGS = 'Bags',
  DRESSES = 'Dresses',
  JACKETS = 'Jackets',
  GLOVES = 'Gloves',
}

const categories: Category[] = [
  {
    name: CategorySlug.ALL,
    icon: <ShoppingBasket className="w-4 h-4" />,
    slug: CategorySlug.ALL,
  },
  {
    name: CategorySlug.T_SHIRTS,
    icon: <Shirt className="w-4 h-4" />,
    slug: CategorySlug.T_SHIRTS,
  },
  {
    name: CategorySlug.SHOES,
    icon: <Footprints className="w-4 h-4" />,
    slug: CategorySlug.SHOES,
  },
  {
    name: CategorySlug.ACCESSORIES,
    icon: <Glasses className="w-4 h-4" />,
    slug: CategorySlug.ACCESSORIES,
  },
  {
    name: CategorySlug.BAGS,
    icon: <Briefcase className="w-4 h-4" />,
    slug: CategorySlug.BAGS,
  },
  {
    name: CategorySlug.DRESSES,
    icon: <Venus className="w-4 h-4" />,
    slug: CategorySlug.DRESSES,
  },
  {
    name: CategorySlug.JACKETS,
    icon: <Shirt className="w-4 h-4" />,
    slug: CategorySlug.JACKETS,
  },
  {
    name: CategorySlug.GLOVES,
    icon: <Hand className="w-4 h-4" />,
    slug: CategorySlug.GLOVES,
  },
]

const Categories = () => {
  const searchParams = useSearchParams()
  const selectedCategory = searchParams.get(CATEGORY)
  const router = useRouter()
  const pathname = usePathname()

  const handleClick = (val: string | null) => {
    const params = new URLSearchParams(searchParams)
    params.set(CATEGORY, val || ALL)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 bg-gray-200 p-2 mb-4 text-sm rounded-lg">
      {categories.map(({ name, icon, slug }) => (
        <div
          className={`flex items-center justify-center gap-2 cursor-pointer px-2 py-1 rounded-md
                      ${slug === selectedCategory ? 'bg-white' : 'text-gray-500'}`}
          key={name}
          onClick={() => handleClick(slug)}
        >
          {icon}
          {name}
        </div>
      ))}
    </div>
  )
}

export default Categories
