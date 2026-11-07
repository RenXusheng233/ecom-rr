import { auth } from '@clerk/nextjs/server'
import type { AdminCategoryType } from '@repo/types'
import { DataTable } from './data-table'

export default async function CategoriesPage() {
  const { getToken } = await auth()
  const token = await getToken()
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/categories/admin`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  )
  if (!response.ok) throw new Error('Failed to load categories')
  const categories: AdminCategoryType[] = await response.json()

  return (
    <div>
      <div className="mb-8 rounded-md bg-secondary px-4 py-2">
        <h1 className="font-semibold">All Categories</h1>
      </div>
      <DataTable data={categories} />
    </div>
  )
}
