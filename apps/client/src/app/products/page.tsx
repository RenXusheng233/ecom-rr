import ProductList, { FromPage } from '@/components/ProductList'

const ProductsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) => {
  const category = (await searchParams).category

  return (
    <div className="">
      <ProductList category={category} from={FromPage.Products} />
    </div>
  )
}

export default ProductsPage
