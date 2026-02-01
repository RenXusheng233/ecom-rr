'use client'

import { Search } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

const SearchBar = () => {
  const [val, setVal] = useState('')
  const searchParams = useSearchParams()
  const router = useRouter()

  const handleSearch = (val: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('search', val)
    router.push(`/products?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="hidden sm:flex items-center gap-2 rounded-md ring-1 ring-gray-200 px-2 py-1 shadow-md">
      <Search className="w-4 h-4 text-gray-500" />
      <input
        id="search"
        placeholder="Search..."
        className="text-sm outline-0"
        onChange={(e) => {
          setVal(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleSearch(val)
          }
        }}
      />
    </div>
  )
}

export default SearchBar
