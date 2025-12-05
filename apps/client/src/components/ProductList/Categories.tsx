'use client'

import { ALL, CATEGORY, Category } from '@/types'
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

const categories: Category[] = [
  {
    name: 'All',
    icon: <ShoppingBasket className="w-4 h-4" />,
    slug: 'all',
  },
  {
    name: 'T-shirts',
    icon: <Shirt className="w-4 h-4" />,
    slug: 't-shirts',
  },
  {
    name: 'Shoes',
    icon: <Footprints className="w-4 h-4" />,
    slug: 'shoes',
  },
  {
    name: 'Accessories',
    icon: <Glasses className="w-4 h-4" />,
    slug: 'accessories',
  },
  {
    name: 'Bags',
    icon: <Briefcase className="w-4 h-4" />,
    slug: 'bags',
  },
  {
    name: 'Dresses',
    icon: <Venus className="w-4 h-4" />,
    slug: 'dresses',
  },
  {
    name: 'Jackets',
    icon: <Shirt className="w-4 h-4" />,
    slug: 'jackets',
  },
  {
    name: 'Gloves',
    icon: <Hand className="w-4 h-4" />,
    slug: 'gloves',
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
