import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import type { Request, Response } from 'express'

const makeResponse = () => {
  const state: { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: null,
  }
  const response = {
    status(code: number) {
      state.statusCode = code
      return this
    },
    json(body: unknown) {
      state.body = body
      return this
    },
  }
  return { state, response: response as unknown as Response }
}

test(
  'catalog visibility filters before limit and missing details return 404',
  { skip: !process.env.TEST_PRODUCT_DATABASE_URL },
  async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL
    const originalEnforcement = process.env.CATALOG_SYNC_ENFORCEMENT
    process.env.DATABASE_URL = process.env.TEST_PRODUCT_DATABASE_URL
    process.env.CATALOG_SYNC_ENFORCEMENT = 'true'
    const { prisma } = await import('@repo/product-db')
    const { getProducts, getProduct, updateProduct } =
      await import('./product.controller')

    try {
      const slug = `test-${randomUUID()}`
      await prisma.category.create({ data: { name: 'Test', slug } })
      const common = {
        shortDescription: 'Test item',
        description: 'Test item description',
        price: 20,
        sizes: ['m'],
        colors: ['blue'],
        images: { blue: 'https://example.com/blue.png' },
        categorySlug: slug,
        stripeSyncStatus: 'SYNCED' as const,
      }
      const current = await prisma.product.create({
        data: {
          ...common,
          name: 'Current',
          stripeSyncedVersion: 1,
          createdAt: new Date('2020-01-01'),
        },
      })
      const stale = await prisma.product.create({
        data: {
          ...common,
          name: 'Stale',
          catalogVersion: 2,
          stripeSyncedVersion: 1,
          createdAt: new Date('2021-01-01'),
        },
      })

      const list = makeResponse()
      await getProducts(
        { query: { category: slug, limit: '1' } } as unknown as Request,
        list.response,
      )
      assert.equal(list.state.statusCode, 200)
      assert.deepEqual(
        (list.state.body as Array<{ id: number }>).map(({ id }) => id),
        [current.id],
      )

      const detail = makeResponse()
      await getProduct(
        { params: { id: String(stale.id) } } as unknown as Request,
        detail.response,
      )
      assert.equal(detail.state.statusCode, 404)

      const invalidLimit = makeResponse()
      await getProducts(
        { query: { limit: '-1' } } as unknown as Request,
        invalidLimit.response,
      )
      assert.equal(invalidLimit.state.statusCode, 400)

      const invalidUpdate = makeResponse()
      await updateProduct(
        {
          params: { id: String(current.id) },
          body: { colors: ['red'] },
        } as unknown as Request,
        invalidUpdate.response,
      )
      assert.equal(invalidUpdate.state.statusCode, 400)
      assert.equal(
        (await prisma.product.findUniqueOrThrow({ where: { id: current.id } }))
          .catalogVersion,
        1,
      )
    } finally {
      await prisma.$disconnect()
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = originalDatabaseUrl
      if (originalEnforcement === undefined)
        delete process.env.CATALOG_SYNC_ENFORCEMENT
      else process.env.CATALOG_SYNC_ENFORCEMENT = originalEnforcement
    }
  },
)
