import type { AdminProductType } from '@repo/types'
import { DataTable } from './data-table'
import { auth } from '@clerk/nextjs/server'
import ProductArchiveTasks from '@/components/ProductArchiveTasks'

const getData = async (): Promise<AdminProductType[]> => {
  const { getToken } = await auth()
  const token = await getToken()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/products/admin`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    },
  )
  if (!res.ok) throw new Error('Failed to load products')
  return res.json()
}

const ProductsPage = async () => {
  const data = await getData()

  return (
    <div className="">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md">
        <h1 className="font-semibold">All Products</h1>
      </div>
      <DataTable data={data} />
      <ProductArchiveTasks />
    </div>
  )
}

export default ProductsPage
