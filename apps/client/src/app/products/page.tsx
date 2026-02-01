import ProductList, { FromPage } from '@/components/ProductList'

const ProductsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; search?: string }>
}) => {
  const category = (await searchParams).category
  const sort = (await searchParams).sort
  const search = (await searchParams).search

  return (
    <div className="">
      <ProductList
        category={category}
        sort={sort}
        search={search}
        from={FromPage.Products}
      />
    </div>
  )
}

export default ProductsPage
