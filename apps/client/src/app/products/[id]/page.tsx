import ProductInteraction from '@/components/Product/ProductInteraction'
import { ProductType } from '@repo/types'
import Image from 'next/image'

// NOTE: TEMPORARY
// const product: ProductType = {
//   id: 1,
//   name: 'Adidas CoreFit T-Shirt',
//   shortDescription:
//     'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//   description:
//     'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//   price: 39.9,
//   sizes: ['s', 'm', 'l', 'xl', 'xxl'],
//   colors: ['gray', 'purple', 'green'],
//   images: {
//     gray: '/products/1g.png',
//     purple: '/products/1p.png',
//     green: '/products/1gr.png',
//   },
//   createdAt: new Date(),
//   updatedAt: new Date(),
//   categorySlug: 'test',
// }

const fetchProduct = async (id: string) => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/products/${id}`,
  )
  const product: ProductType = await res.json()
  return product
}

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const product = await fetchProduct(id)

  return {
    title: product.name,
    description: product.description,
  }
}

const ProductPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ size: string; color: string }>
}) => {
  const { id } = await params
  const { size, color } = await searchParams

  const product = await fetchProduct(id)

  const selectedSize = size || product.sizes[0]!
  const selectedColor = color || product.colors[0]!

  return (
    <div className="flex flex-col gap-4 lg:flex-row md:gap-12 mt-12">
      {/* IMAGE */}
      <div className="w-full lg:w-6/12 relative aspect-2/3">
        <Image
          src={
            (product.images as Record<string, string>)?.[selectedColor] || ''
          }
          alt={product.name}
          fill
          sizes="auto"
          loading="eager"
          className="object-contain rounded-md"
        />
      </div>
      {/* DETAILS */}
      <div className="w-full lg:6/12 flex flex-col gap-4">
        <h1 className="text-2xl font-medium">{product.name}</h1>
        <p className="text-gray-500">{product.description}</p>
        <h2 className="text-2xl font-semibold">${product.price}</h2>
        {/* INTERACTION */}
        <ProductInteraction
          product={product}
          selectedSize={selectedSize}
          selectedColor={selectedColor}
        />
        {/* CARD INFO */}
        <div className="flex items-center gap-2 mt-4">
          <Image
            src="/klarna.png"
            alt="klarna"
            width={50}
            height={25}
            className="rounded-md"
          />
          <Image
            src="/cards.png"
            alt="cards"
            width={50}
            height={25}
            className="rounded-md"
          />
          <Image
            src="/stripe.png"
            alt="stripe"
            width={50}
            height={25}
            className="rounded-md"
          />
        </div>
        <div className="text-gray-500 text-xs">
          By clicking Pay Now, you agree to our&nbsp;
          <span className="underline hover:text-black cursor-pointer">
            Terms & Conditions
          </span>
          &nbsp;and&nbsp;
          <span className="underline hover:text-black cursor-pointer">
            Privacy Policy
          </span>
          . You authorize us to charge your selected payment method for the
          total amount shown. All sales are subject to our return and&nbsp;
          <span className="underline hover:text-black cursor-pointer">
            Refound Policies
          </span>
        </div>
      </div>
    </div>
  )
}

export default ProductPage
