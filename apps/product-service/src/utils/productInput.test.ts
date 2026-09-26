import assert from 'node:assert/strict'
import test from 'node:test'
import { ProductFormSchema, ProductUpdateSchema } from '@repo/types'

const product = {
  name: 'Shirt',
  shortDescription: 'Cotton shirt',
  description: 'A cotton shirt',
  price: 25,
  categorySlug: 'shirts',
  colors: ['blue'],
  sizes: ['m'],
  images: { blue: 'https://example.com/blue.png' },
}

test('product writes accept valid catalog fields', () => {
  assert.equal(ProductFormSchema.safeParse(product).success, true)
  assert.equal(ProductUpdateSchema.safeParse({ price: 30 }).success, true)
})

test('product writes reject fractional prices and internal fields', () => {
  assert.equal(
    ProductFormSchema.safeParse({ ...product, price: 25.5 }).success,
    false,
  )
  assert.equal(
    ProductFormSchema.safeParse({ ...product, catalogVersion: 9 }).success,
    false,
  )
  assert.equal(ProductUpdateSchema.safeParse({ id: 7 }).success, false)
  assert.equal(
    ProductUpdateSchema.safeParse({ stripeSyncStatus: 'SYNCED' }).success,
    false,
  )
  assert.equal(ProductUpdateSchema.safeParse({}).success, false)
})

test('product images must cover every selected color', () => {
  assert.equal(
    ProductFormSchema.safeParse({ ...product, colors: ['blue', 'red'] })
      .success,
    false,
  )
})
