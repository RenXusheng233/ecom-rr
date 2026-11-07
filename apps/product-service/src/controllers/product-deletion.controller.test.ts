import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import type { Request, Response } from 'express'
import type { PrismaClient, ProductOutboxEvent } from '@repo/product-db'

const product = {
  id: 42,
  name: 'Trail shoe',
  price: 129,
  sizes: ['42'],
  colors: ['black'],
  categorySlug: 'shoes',
  catalogVersion: 3,
}
let current: typeof product | null
let events: ProductOutboxEvent[]
const unexpectedQuery = async (): Promise<never> => {
  throw new Error('Unexpected database query')
}
const transaction = {
  $queryRaw: async () => [],
  product: {
    findUnique: async () => current,
    findUniqueOrThrow: async () => {
      if (!current) throw new Error('Product not found')
      return current
    },
    delete: async () => {
      const deleted = current
      current = null
      return deleted
    },
  },
  productOutboxEvent: {
    findFirst: async () => events.at(-1) ?? null,
    create: async ({ data }: { data: Partial<ProductOutboxEvent> }) => {
      const event = {
        ...data,
        status: 'PENDING',
        attempts: 0,
        lastError: null,
        createdAt: new Date('2026-11-04T00:00:00Z'),
      } as ProductOutboxEvent
      events.push(event)
      return event
    },
  },
}
const database = {
  $transaction: async (
    operation: (tx: typeof transaction) => Promise<unknown>,
  ) => operation(transaction),
  product: { findMany: unexpectedQuery },
  productOutboxEvent: { findMany: unexpectedQuery },
}
;(globalThis as unknown as { prisma: PrismaClient }).prisma =
  database as unknown as PrismaClient
const controller = await import('./product.controller')

beforeEach(() => {
  current = { ...product }
  events = []
})
afterEach(() => mock.restoreAll())

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
const request = (id: string) => ({ params: { id } }) as unknown as Request

test('deletes a product and returns the persisted ARCHIVE task identity', async () => {
  const { state, response } = makeResponse()
  await controller.deleteProduct(request('42'), response)
  assert.equal(state.status, 200)
  assert.equal(current, null)
  assert.equal(events.length, 1)
  const event = events[0]!
  assert.equal(event.operation, 'ARCHIVE')
  assert.equal(event.aggregateVersion, 4)
  assert.equal((event.payload as { product: unknown }).product, null)
  assert.deepEqual(state.body, {
    ...product,
    deletionTask: {
      taskId: event.id,
      productId: 42,
      catalogVersion: 4,
      deletedAt: '2026-11-04T00:00:00.000Z',
      dispatchStatus: 'PENDING',
      dispatchError: null,
    },
  })
})

test('reuses the archive task after a repeated delete or lost HTTP response', async () => {
  const first = makeResponse()
  await controller.deleteProduct(request('42'), first.response)
  const second = makeResponse()
  await controller.deleteProduct(request('42'), second.response)
  assert.equal(second.state.status, 200)
  assert.deepEqual(
    (second.state.body as { deletionTask: unknown }).deletionTask,
    (first.state.body as { deletionTask: unknown }).deletionTask,
  )
  assert.equal(events.length, 1)
})

test('returns 404 for a missing product with no previous archive', async () => {
  current = null
  const { state, response } = makeResponse()
  await controller.deleteProduct(request('42'), response)
  assert.equal(state.status, 404)
  assert.equal(events.length, 0)
})

for (const id of ['0', '-1', '1.5', 'invalid', '2147483648']) {
  test(`rejects invalid product deletion ID ${id} before querying`, async () => {
    mock.method(database, '$transaction', unexpectedQuery)
    const { state, response } = makeResponse()
    await controller.deleteProduct(request(id), response)
    assert.equal(state.status, 400)
  })
}

test('returns a safe failure response if persisting the archive task fails', async () => {
  mock.method(transaction.productOutboxEvent, 'create', async () => {
    throw new Error('Outbox unavailable')
  })
  const { state, response } = makeResponse()
  await controller.deleteProduct(request('42'), response)
  assert.equal(state.status, 503)
  assert.doesNotMatch(JSON.stringify(state.body), /Outbox unavailable/)
})

test('includes the current category name and slug in the admin product list', async () => {
  const category = { id: 7, name: 'Shoes', slug: 'shoes' }
  mock.method(database.product, 'findMany', async (args: unknown) => {
    assert.deepEqual(args, {
      orderBy: { createdAt: 'desc' },
      include: { category: { select: { id: true, name: true, slug: true } } },
    })
    return [{ ...product, category }]
  })
  const { state, response } = makeResponse()
  await controller.getAdminProducts({} as Request, response)
  assert.deepEqual(state.body, [{ ...product, category }])
})

test('reads a bounded cursor page of durable archive tasks', async () => {
  const event = {
    id: 'archive-1',
    aggregateId: '42',
    aggregateVersion: 4,
    createdAt: new Date('2026-11-04T00:00:00Z'),
    status: 'PUBLISHED',
    lastError: null,
  }
  mock.method(
    database.productOutboxEvent,
    'findMany',
    async (args: unknown) => {
      assert.deepEqual(args, {
        where: { operation: 'ARCHIVE' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 2,
        cursor: { id: 'previous-task' },
        skip: 1,
      })
      return [event, { ...event, id: 'archive-2' }]
    },
  )
  const { state, response } = makeResponse()
  await controller.getProductDeletions(
    { query: { limit: '1', cursor: 'previous-task' } } as unknown as Request,
    response,
  )
  assert.deepEqual(state.body, {
    tasks: [
      {
        taskId: 'archive-1',
        productId: 42,
        catalogVersion: 4,
        deletedAt: '2026-11-04T00:00:00.000Z',
        dispatchStatus: 'PUBLISHED',
        dispatchError: null,
      },
    ],
    nextCursor: 'archive-1',
  })
})

test('rejects an unbounded archive list request', async () => {
  const { state, response } = makeResponse()
  await controller.getProductDeletions(
    { query: { limit: '10000' } } as unknown as Request,
    response,
  )
  assert.equal(state.status, 400)
})

test('returns safe JSON instead of exposing archive query errors', async () => {
  mock.method(database.productOutboxEvent, 'findMany', async () => {
    throw new Error('Database credentials: sensitive-test-placeholder')
  })
  const { state, response } = makeResponse()
  await controller.getProductDeletions({ query: {} } as Request, response)
  assert.equal(state.status, 503)
  assert.match((state.body as { error: string }).error, /could not be loaded/i)
  assert.doesNotMatch(
    JSON.stringify(state.body),
    /credentials|sensitive-test-placeholder/i,
  )
})
