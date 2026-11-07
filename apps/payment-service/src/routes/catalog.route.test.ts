import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { Hono } from 'hono'
import type { PrismaClient } from '@repo/payment-db'

process.env.STRIPE_SECRET_KEY = 'sk_test_catalog_admin_fake'
const unexpectedQuery = async (): Promise<never> => {
  throw new Error('Unexpected database query')
}
const database = {
  stripeCatalogItem: { findMany: unexpectedQuery, updateMany: unexpectedQuery },
}
;(globalThis as unknown as { paymentPrisma: PrismaClient }).paymentPrisma =
  database as unknown as PrismaClient
const { default: catalogRoute } = await import('./catalog.route')
afterEach(() => mock.restoreAll())

const appForRole = (role: string | null) => {
  const app = new Hono<{ Variables: { clerkAuth: () => unknown } }>()
  app.use('*', async (context, next) => {
    context.set('clerkAuth', () =>
      role === null
        ? null
        : {
            userId: 'test-user',
            sessionClaims: { metadata: { role } },
          },
    )
    await next()
  })
  return app.route('/', catalogRoute)
}
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const identity = { taskId: 'archive-42', catalogVersion: 4 }

for (const [role, status] of [
  [null, 401],
  ['user', 403],
] as const) {
  test(`protects archive read and retry from role ${role}`, async () => {
    const app = appForRole(role)
    assert.equal(
      (await app.request('/archive-states', post({ productIds: ['42'] })))
        .status,
      status,
    )
    assert.equal(
      (await app.request('/42/archive-retry', post(identity))).status,
      status,
    )
  })
}

test('batch reads only catalog fields and does not expose raw Stripe errors', async () => {
  mock.method(database.stripeCatalogItem, 'findMany', async (args: unknown) => {
    assert.deepEqual(args, {
      where: { productId: { in: ['42'] } },
      select: {
        productId: true,
        desiredEventId: true,
        desiredVersion: true,
        desiredOperation: true,
        appliedVersion: true,
        status: true,
        lastError: true,
      },
    })
    return [
      {
        productId: '42',
        desiredEventId: 'archive-42',
        desiredVersion: 4,
        desiredOperation: 'ARCHIVE',
        appliedVersion: 3,
        status: 'FAILED',
        lastError: 'Invalid API Key provided: sk_test_fake_value',
      },
    ]
  })
  const response = await appForRole('admin').request(
    '/archive-states',
    post({ productIds: ['42', '42'] }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.items[0].desiredEventId, 'archive-42')
  assert.match(body.items[0].lastError, /authentication/i)
  assert.doesNotMatch(JSON.stringify(body), /sk_test/)
})

test('explains the stored default-price archive error without exposing its raw content', async () => {
  mock.method(database.stripeCatalogItem, 'findMany', async () => [
    {
      productId: '42',
      desiredEventId: 'archive-42',
      desiredVersion: 4,
      desiredOperation: 'ARCHIVE',
      appliedVersion: 3,
      status: 'FAILED',
      lastError:
        'This price cannot be archived because it is the default price of a product. sk_test_placeholder',
    },
  ])
  const response = await appForRole('admin').request(
    '/archive-states',
    post({ productIds: ['42'] }),
  )
  const body = await response.json()
  assert.match(body.items[0].lastError, /default price/i)
  assert.doesNotMatch(JSON.stringify(body), /sk_test_placeholder/)
})

for (const body of [
  { productIds: [] },
  { productIds: ['invalid'] },
  { productIds: Array(51).fill('42') },
]) {
  test(`rejects invalid archive batch input of size ${body.productIds.length}`, async () => {
    const response = await appForRole('admin').request(
      '/archive-states',
      post(body),
    )
    assert.equal(response.status, 400)
  })
}

test('retries only the failed archive with the expected event and version', async () => {
  mock.method(
    database.stripeCatalogItem,
    'updateMany',
    async (args: unknown) => {
      const query = args as {
        where: unknown
        data: { status: string; attempts: number; desiredRunId: string }
      }
      assert.deepEqual(query.where, {
        productId: '42',
        desiredOperation: 'ARCHIVE',
        desiredEventId: 'archive-42',
        desiredVersion: 4,
        status: 'FAILED',
      })
      assert.equal(query.data.status, 'PENDING')
      assert.equal(query.data.attempts, 0)
      assert.ok(query.data.desiredRunId)
      return { count: 1 }
    },
  )
  const response = await appForRole('admin').request(
    '/42/archive-retry',
    post(identity),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { queued: true })
})

test('rejects a stale archive retry after the operation or version has changed', async () => {
  mock.method(database.stripeCatalogItem, 'updateMany', async () => ({
    count: 0,
  }))
  const response = await appForRole('admin').request(
    '/42/archive-retry',
    post(identity),
  )
  assert.equal(response.status, 409)
})

test('rejects malformed JSON and invalid retry identities', async () => {
  const app = appForRole('admin')
  assert.equal(
    (
      await app.request(
        '/42/archive-retry',
        post({ taskId: '', catalogVersion: 4 }),
      )
    ).status,
    400,
  )
  assert.equal(
    (await app.request('/invalid/archive-retry', post(identity))).status,
    400,
  )
  assert.equal(
    (await app.request('/archive-states', { method: 'POST', body: '{' }))
      .status,
    400,
  )
})
