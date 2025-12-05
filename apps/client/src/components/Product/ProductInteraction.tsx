'use client'

import useCartStore from '@/stores/cartStore'
import { COLOR, ProductType, SIZE } from '@/types'
import { Minus, Plus, ShoppingCart } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'react-toastify'

const ProductInteraction = ({
  product,
  selectedSize,
  selectedColor,
}: {
  product: ProductType
  selectedSize: string
  selectedColor: string
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [quantity, setQuantity] = useState<number>(1)

  const { addToCart } = useCartStore()

  const handleTypeChange = (type: string, val: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set(type, val)
    router.push(`${pathname}?${params}`, { scroll: false })
  }

  const handleAddToCart = () => {
    addToCart({
      ...product,
      quantity,
      selectedSize,
      selectedColor,
    })

    toast.success('Product added to cart.')
  }

  const handleBuyThisItem = () => {
    // TODO: Buy this item
    console.log('buy this item')
  }

  return (
    <div className="flex flex-col gap-4 mt-4">
      {/* SIZE */}
      <div className="flex flex-col text-xs gap-2">
        <span className="text-gray-500">Size</span>
        <div className="flex items-center gap-2">
          {product.sizes.map((size) => (
            <div
              key={size}
              onClick={() => handleTypeChange(SIZE, size)}
              className={`cursor-pointer border p-0.5
                          ${selectedSize === size ? 'border-b-gray-600' : 'border-gray-300'}`}
            >
              <div
                className={`w-6 h-6 flex items-center justify-center
                            ${selectedSize === size ? 'bg-black text-white' : 'bg-white text-black'}`}
              >
                {size.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* COLOR */}
      <div className="flex flex-col text-xs gap-2">
        <span className="text-gray-500">Color</span>
        <div className="flex items-center gap-2">
          {product.colors.map((color) => (
            <div
              key={color}
              onClick={() => handleTypeChange(COLOR, color)}
              className={`cursor-pointer border p-0.5
                          ${selectedColor === color ? 'border-gray-300' : 'border-white'}`}
            >
              <div className="w-6 h-6" style={{ backgroundColor: color }} />
            </div>
          ))}
        </div>
      </div>
      {/* QUANTITY */}
      <div className="flex flex-col text-xs gap-2">
        <span className="text-gray-500">Quantity</span>
        <div className="flex items-center gap-2">
          <button
            className="cursor-pointer border border-gray-300 p-1"
            disabled={quantity === 1}
            onClick={() => setQuantity((quantity) => quantity - 1)}
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="font-medium text-base">{quantity}</span>
          <button
            className="cursor-pointer border border-gray-300 p-1"
            onClick={() => setQuantity((quantity) => quantity + 1)}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* BUTTONS */}
      <button
        onClick={handleAddToCart}
        className="bg-gray-800 text-white rounded-md cursor-pointer shadow-lg
                   flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium"
      >
        <Plus className="w-4 h-4" />
        Add to Cart
      </button>
      <button
        onClick={handleBuyThisItem}
        className="ring-1 ring-gray-400 text-gray-800 rounded-md cursor-pointer shadow-lg
                   flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium"
      >
        <ShoppingCart className="w-4 h-4" />
        Buy this Item
      </button>
    </div>
  )
}

export default ProductInteraction
