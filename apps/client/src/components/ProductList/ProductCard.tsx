'use client'

import useCartStore from '@/stores/cartStore'
import { ProductType } from '@/types'
import { ShoppingCart } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'react-toastify'

const ProductCard = ({ product }: { product: ProductType }) => {
  const { id, name, shortDescription, sizes, colors, images, price } = product

  const [productTypes, setProductTypes] = useState({
    size: product.sizes[0],
    color: product.colors[0],
  } as { size: string; color: string })

  const { addToCart } = useCartStore()

  const handleProductType = ({
    type,
    val,
  }: {
    type: 'size' | 'color'
    val: string
  }) => {
    setProductTypes((prev) => ({
      ...prev,
      [type]: val,
    }))
  }

  const handleAddToCart = () => {
    addToCart({
      ...product,
      quantity: 1,
      selectedSize: productTypes.size,
      selectedColor: productTypes.color,
    })
    toast.success('Product added to cart.')
  }

  return (
    <div className="shadow-lg rounded-lg overflow-hidden">
      {/* IMAGE */}
      <Link href={`products/${id}`}>
        <div className="relative aspect-2/3">
          <Image
            src={images[productTypes.color]}
            alt={name}
            className="object-cover hover:scale-105 transition-all duration-300"
            fill
            sizes="auto"
          />
        </div>
      </Link>
      {/* PRODUCT DETAIL */}
      <div className="flex flex-col gap-4 p-4">
        <h1 className="font-medium">{name}</h1>
        <p className="text-sm text-gray-500">{shortDescription}</p>
        {/* PRODUCT TYPES */}
        <div className="flex items-center gap-4 text-xs">
          {/* SIZES */}
          <div className="flex flex-col gap-1">
            <span className="text-gray-500">Size</span>
            <select
              name="size"
              id="size"
              className="ring ring-gray-300 rounded-sm px-2 py-1"
              onChange={(e) =>
                handleProductType({ type: 'size', val: e.target.value })
              }
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          {/* COLORS */}
          <div className="flex flex-col gap-1">
            <span className="text-gray-500">Color</span>
            <div className="flex items-center gap-2">
              {colors.map((color) => (
                <div
                  key={color}
                  className={`cursor-pointer border ${productTypes.color === color ? 'border-gray-500' : 'border-gray-200'} rounded-full p-0.5`}
                >
                  <div
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: color }}
                    onClick={() =>
                      handleProductType({ type: 'color', val: color })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* PRICE AND ADD TO CART */}
        <div className="flex items-center justify-between">
          <p className="font-medium">${price.toFixed(2)}</p>
          <button
            onClick={handleAddToCart}
            className="ring-1 ring-gray-200 shadow-lg rounded-md px-2 py-1 text-sm cursor-pointer
           hover:text-white hover:bg-black transition-all duration-300 flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProductCard
