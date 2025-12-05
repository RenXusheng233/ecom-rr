import ProductList, { FromPage } from '@/components/ProductList'
import Image from 'next/image'

const Homepage = async ({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) => {
  const category = (await searchParams).category

  return (
    <div>
      <div className="relative aspect-3/1 mb-12">
        <Image
          src="/featured.png"
          alt="Featured Product"
          fill
          sizes="auto"
          loading="eager"
        />
      </div>
      <ProductList category={category} from={FromPage.Home} />
    </div>
  )
}

export default Homepage
