import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mock, test } from 'node:test'
import type { Request, Response } from 'express'
import type { Prisma } from '@repo/product-db'
import type { ProductDeletionTask } from '@repo/types'

const makeResponse = () => {
  const state = { status: 200, body: undefined as unknown }
  const response = {
    status(code: number) {
      state.status = code
      return response
    },
    json(body: unknown) {
      state.body = body
      return response
    },
  } as Response
  return { state, response }
}

test(
  'product deletion rolls back on outbox failure and concurrent requests reuse one archive',
  {
    skip: !process.env.TEST_PRODUCT_DATABASE_URL,
  },
  async () => {
    const previousUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = process.env.TEST_PRODUCT_DATABASE_URL
    const { prisma } = await import('@repo/product-db')
    const { deleteProduct } = await import('./product.controller')
    const slug = `deletion-test-${randomUUID()}`
    let productId: number | undefined
    try {
      await prisma.category.create({ data: { name: 'Deletion test', slug } })
      const product = await prisma.product.create({
        data: {
          name: 'Deletion test product',
          shortDescription: 'Test fixture',
          description: 'Test fixture',
          price: 10,
          sizes: ['m'],
          colors: ['black'],
          images: { black: '/test.png' },
          categorySlug: slug,
        },
      })
      productId = product.id
      const request = {
        params: { id: String(product.id) },
      } as unknown as Request
      const runTransaction = prisma.$transaction.bind(prisma) as (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) => Promise<unknown>
      const failOutbox = (
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
      ) =>
        runTransaction((tx) => {
          const failing = new Proxy(tx, {
            get(target, key) {
              if (key === 'productOutboxEvent')
                return new Proxy(target.productOutboxEvent, {
                  get(model, method) {
                    if (method === 'create')
                      return async () => {
                        throw new Error('Outbox unavailable')
                      }
                    return Reflect.get(model, method)
                  },
                })
              return Reflect.get(target, key)
            },
          })
          return operation(failing)
        })
      const transactionMock = mock.method(
        prisma,
        '$transaction',
        failOutbox as typeof prisma.$transaction,
      )
      try {
        const failed = makeResponse()
        await deleteProduct(request, failed.response)
        assert.equal(failed.state.status, 503)
      } finally {
        transactionMock.mock.restore()
      }
      assert.ok(await prisma.product.findUnique({ where: { id: product.id } }))
      assert.equal(
        await prisma.productOutboxEvent.count({
          where: { aggregateId: String(product.id) },
        }),
        0,
      )

      const first = makeResponse()
      const second = makeResponse()
      await Promise.all([
        deleteProduct(request, first.response),
        deleteProduct(request, second.response),
      ])
      assert.equal(first.state.status, 200)
      assert.equal(second.state.status, 200)
      assert.equal(
        (first.state.body as { deletionTask: ProductDeletionTask }).deletionTask
          .taskId,
        (second.state.body as { deletionTask: ProductDeletionTask })
          .deletionTask.taskId,
      )
      assert.equal(
        await prisma.product.findUnique({ where: { id: product.id } }),
        null,
      )
      assert.equal(
        await prisma.productOutboxEvent.count({
          where: { aggregateId: String(product.id), operation: 'ARCHIVE' },
        }),
        1,
      )
    } finally {
      if (productId !== undefined) {
        await prisma.product.deleteMany({ where: { id: productId } })
        await prisma.productOutboxEvent.deleteMany({
          where: { aggregateId: String(productId) },
        })
      }
      await prisma.category.deleteMany({ where: { slug } })
      await prisma.$disconnect()
      if (previousUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = previousUrl
    }
  },
)
