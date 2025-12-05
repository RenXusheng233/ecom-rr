'use client'

import { SORT } from '@/types'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const options = [
  {
    label: 'Newest',
    value: 'newest',
  },
  {
    label: 'Oldest',
    value: 'oldest',
  },
  {
    label: 'Price: Low to High',
    value: 'asc',
  },
  {
    label: 'Price: High to Low',
    value: 'desc',
  },
]

const Filter = () => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const handleChange = (val: string) => {
    const params = new URLSearchParams(searchParams)
    params.set(SORT, val)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex items-center justify-end gap-2 text-sm text-gray-500 my-6">
      <span>Sort by:</span>
      <select
        name="sort"
        id="sort"
        className="ring-1 ring-gray-200 shadow-md p-1 rounded-sm"
        onChange={(e) => handleChange(e.target.value)}
      >
        {options.map(({ label, value }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default Filter
