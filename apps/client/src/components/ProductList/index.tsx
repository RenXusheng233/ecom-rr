import { ProductType } from '@repo/types'
import Link from 'next/link'
import Categories, { CATEGORY } from './Categories'
import ProductCard from './ProductCard'
import Filter from './Filter'

const HOME_PAGE_PRODUCTS_LIMIT = 8

export enum FromPage {
  Home = 'home',
  Products = 'products',
}

interface ProductsParams {
  category?: string
  sort?: string
  search?: string
  from: FromPage
}

// NOTE: TEMPORARY
// const products: ProductType[] = [
//   {
//     id: 1,
//     name: 'Adidas CoreFit T-Shirt',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 39.9,
//     sizes: ['s', 'm', 'l', 'xl', 'xxl'],
//     colors: ['gray', 'purple', 'green'],
//     images: {
//       gray: '/products/1g.png',
//       purple: '/products/1p.png',
//       green: '/products/1gr.png',
//     },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
//   {
//     id: 2,
//     name: 'Puma Ultra Warm Zip',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 59.9,
//     sizes: ['s', 'm', 'l', 'xl'],
//     colors: ['gray', 'green'],
//     images: { gray: '/products/2g.png', green: '/products/2gr.png' },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
//   {
//     id: 3,
//     name: 'Nike Air Essentials Pullover',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 69.9,
//     sizes: ['s', 'm', 'l'],
//     colors: ['green', 'blue', 'black'],
//     images: {
//       green: '/products/3gr.png',
//       blue: '/products/3b.png',
//       black: '/products/3bl.png',
//     },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
//   {
//     id: 123,
//     name: 'Nike Dri Flex T-Shirt',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 29.9,
//     sizes: ['s', 'm', 'l'],
//     colors: ['white', 'pink'],
//     images: { white: '/products/4w.png', pink: '/products/4p.png' },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
//   {
//     id: 5,
//     name: 'Under Armour StormFleece',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 49.9,
//     sizes: ['s', 'm', 'l'],
//     colors: ['red', 'orange', 'black'],
//     images: {
//       red: '/products/5r.png',
//       orange: '/products/5o.png',
//       black: '/products/5bl.png',
//     },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
//   {
//     id: 6,
//     name: 'Nike Air Max 270',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 59.9,
//     sizes: ['40', '42', '43', '44'],
//     colors: ['gray', 'white'],
//     images: { gray: '/products/6g.png', white: '/products/6w.png' },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
//   {
//     id: 7,
//     name: 'Nike Ultraboost Pulse ',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 69.9,
//     sizes: ['40', '42', '43'],
//     colors: ['gray', 'pink'],
//     images: { gray: '/products/7g.png', pink: '/products/7p.png' },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
//   {
//     id: 8,
//     name: 'Levi’s Classic Denim',
//     shortDescription:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     description:
//       'Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit. Lorem ipsum dolor sit amet consect adipisicing elit lorem ipsum dolor sit.',
//     price: 59.9,
//     sizes: ['s', 'm', 'l'],
//     colors: ['blue', 'green'],
//     images: { blue: '/products/8b.png', green: '/products/8gr.png' },
//     createdAt: new Date(),
//     updatedAt: new Date(),
//     categorySlug: 'test',
//   },
// ]

const fetchProducts = async ({
  category,
  sort,
  search,
  from,
}: ProductsParams) => {
  const sortParam = `sort=${sort || 'newest'}`
  const categoryParam = category ? `&category=${category}` : ''
  const searchParam = search ? `&search=${search}` : ''
  const fromParam =
    from === FromPage.Home ? `&limit=${HOME_PAGE_PRODUCTS_LIMIT}` : ''

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/products?${sortParam}${categoryParam}${searchParam}${fromParam}`,
  )

  const products: ProductType[] = await res.json()
  return products
}

const ProductList = async ({
  category,
  sort,
  search,
  from,
}: ProductsParams) => {
  // TODO: LOADING
  const products = await fetchProducts({ category, sort, search, from })

  return (
    <div className="w-full">
      <Categories />
      {from === FromPage.Products && <Filter />}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-12">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {from === FromPage.Home && (
        <Link
          href={category ? `/products?${CATEGORY}=${category}` : '/products'}
          className="flex justify-end mt-4 underline text-sm text-gray-500"
        >
          View all products
        </Link>
      )}
    </div>
  )
}

export default ProductList
