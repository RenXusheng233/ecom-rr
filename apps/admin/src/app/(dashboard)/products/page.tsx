import { ProductType } from '@repo/types'
import { columns } from './columns'
import { DataTable } from './data-table'

const getData = async (): Promise<ProductType[]> => {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/products`,
    )
    const data = await res.json()
    return data
  } catch (error) {
    console.error('Error fetching products:', error)
    return []
  }
}

const ProductsPage = async () => {
  const data = await getData()

  return (
    <div className="">
      <div className="mb-8 px-4 py-2 bg-secondary rounded-md">
        <h1 className="font-semibold">All Products</h1>
      </div>
      <DataTable columns={columns} data={data} />
    </div>
  )
}

export default ProductsPage
