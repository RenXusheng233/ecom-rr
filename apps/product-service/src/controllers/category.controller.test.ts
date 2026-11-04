import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import type { Request, Response } from 'express'
import type { PrismaClient } from '@repo/product-db'

const unexpectedQuery = async (): Promise<never> => {
  throw new Error('Unexpected database query')
}
const database = {
  category: {
    findMany: unexpectedQuery,
    update: unexpectedQuery,
    delete: unexpectedQuery,
  },
}
;(globalThis as unknown as { prisma: PrismaClient }).prisma =
  database as unknown as PrismaClient

const { Prisma } = await import('@repo/product-db')
const controller = await import('./category.controller')

afterEach(() => mock.restoreAll())

const category = { id: 7, name: 'Shirts', slug: 'shirts' }

const makeResponse = () => {
  const state: { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: null,
  }
  const response = {
    status(code: number) {
      state.statusCode = code
      return response
    },
    json(body: unknown) {
      state.body = body
      return response
    },
  } as Response
  return { response, state }
}

const databaseError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Database constraint failed', {
    code,
    clientVersion: 'test',
  })

test('lists admin categories with product counts without loading products', async () => {
  mock.method(database.category, 'findMany', async (args: unknown) => {
    assert.deepEqual(args, {
      orderBy: { id: 'desc' },
      include: { _count: { select: { products: true } } },
    })
    return [{ ...category, _count: { products: 3 } }]
  })
  const { response, state } = makeResponse()
  await controller.getAdminCategories({} as Request, response)

  assert.equal(state.statusCode, 200)
  assert.deepEqual(state.body, [{ ...category, productCount: 3 }])
})

test('updates category fields and ignores nested product mutations', async () => {
  mock.method(database.category, 'update', async (args: unknown) => {
    assert.deepEqual(args, {
      where: { id: 7 },
      data: { name: 'Summer Shirts', slug: 'summer-shirts' },
    })
    return { ...category, name: 'Summer Shirts', slug: 'summer-shirts' }
  })
  const { response, state } = makeResponse()

  await controller.updateCategory(
    {
      params: { id: '7' },
      body: {
        name: ' Summer Shirts ',
        slug: ' summer-shirts ',
        products: { deleteMany: {} },
      },
    } as unknown as Request,
    response,
  )

  assert.equal(state.statusCode, 200)
  assert.deepEqual(state.body, {
    id: 7,
    name: 'Summer Shirts',
    slug: 'summer-shirts',
  })
})

for (const body of [
  { name: ' ', slug: 'shirts' },
  { name: 'Shirts', slug: '' },
]) {
  test(`rejects invalid category fields: ${JSON.stringify(body)}`, async () => {
    const { response, state } = makeResponse()

    await controller.updateCategory(
      { params: { id: '7' }, body } as unknown as Request,
      response,
    )

    assert.equal(state.statusCode, 400)
  })
}

for (const id of ['0', '-1', '1.5', 'invalid', '9007199254740992']) {
  for (const operation of ['updateCategory', 'deleteCategory'] as const) {
    test(`${operation} rejects invalid ID ${id}`, async () => {
      const { response, state } = makeResponse()

      await controller[operation](
        {
          params: { id },
          body: { name: 'Shirts', slug: 'shirts' },
        } as unknown as Request,
        response,
      )

      assert.equal(state.statusCode, 400)
    })
  }
}

test('returns a conflict when the edited slug is already used', async () => {
  mock.method(database.category, 'update', async () => {
    throw databaseError('P2002')
  })
  const { response, state } = makeResponse()

  await controller.updateCategory(
    {
      params: { id: '7' },
      body: { name: 'Shirts', slug: 'shirts' },
    } as unknown as Request,
    response,
  )

  assert.equal(state.statusCode, 409)
  assert.match((state.body as { error: string }).error, /slug/i)
})

test('deletes an empty category by its ID', async () => {
  mock.method(database.category, 'delete', async (args: unknown) => {
    assert.deepEqual(args, { where: { id: 7 } })
    return category
  })
  const { response, state } = makeResponse()

  await controller.deleteCategory(
    { params: { id: '7' } } as unknown as Request,
    response,
  )

  assert.equal(state.statusCode, 200)
  assert.deepEqual(state.body, category)
})

test('explains that products must be moved when the database blocks deletion', async () => {
  mock.method(database.category, 'delete', async () => {
    throw databaseError('P2003')
  })
  const { response, state } = makeResponse()

  await controller.deleteCategory(
    { params: { id: '7' } } as unknown as Request,
    response,
  )

  assert.equal(state.statusCode, 409)
  assert.match((state.body as { error: string }).error, /products/i)
  assert.match((state.body as { error: string }).error, /move/i)
})

for (const operation of ['updateCategory', 'deleteCategory'] as const) {
  test(`${operation} reports a category that no longer exists`, async () => {
    mock.method(
      database.category,
      operation === 'updateCategory' ? 'update' : 'delete',
      async () => {
        throw databaseError('P2025')
      },
    )
    const { response, state } = makeResponse()

    await controller[operation](
      {
        params: { id: '7' },
        body: { name: 'Shirts', slug: 'shirts' },
      } as unknown as Request,
      response,
    )

    assert.equal(state.statusCode, 404)
  })
}

test('keeps the public category list response unchanged', async () => {
  mock.method(database.category, 'findMany', async () => [category])
  const { response, state } = makeResponse()

  await controller.getCategories({} as Request, response)

  assert.deepEqual(state.body, [category])
})
