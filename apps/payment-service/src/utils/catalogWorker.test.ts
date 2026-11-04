import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import Stripe from 'stripe'
import type { PrismaClient, StripeCatalogItem } from '@repo/payment-db'

process.env.STRIPE_SECRET_KEY = 'sk_test_catalog_worker_fake'
let item: StripeCatalogItem
const store = {
  stripeCatalogItem: {
    findMany: async () => [item],
    updateMany: async ({ data }: { data: Record<string, unknown> }) => {
      for (const [key, value] of Object.entries(data)) {
        ;(item as unknown as Record<string, unknown>)[key] =
          value && typeof value === 'object' && 'increment' in value
            ? Number((item as unknown as Record<string, unknown>)[key]) +
              Number(value.increment)
            : value
      }
      return { count: 1 }
    },
    findUniqueOrThrow: async () => item,
  },
  paymentOutboxEvent: { create: async () => ({}) },
}
const database = {
  ...store,
  $transaction: async (
    callback: (tx: typeof store) => Promise<unknown>,
  ): Promise<unknown> => callback(store),
}
;(globalThis as unknown as { paymentPrisma: PrismaClient }).paymentPrisma =
  database as unknown as PrismaClient
const { default: stripe } = await import('./stripe')
const { runCatalogSyncBatch } = await import('./catalogWorker')

beforeEach(() => {
  item = {
    productId: '42',
    desiredEventId: 'archive-42',
    desiredVersion: 4,
    desiredOperation: 'ARCHIVE',
    desiredName: null,
    desiredUnitAmount: null,
    desiredCurrency: null,
    desiredSizes: [],
    desiredColors: [],
    desiredRunId: 'run-42',
    appliedVersion: 3,
    stripeProductId: '42',
    stripePriceId: 'price-42',
    status: 'PENDING',
    attempts: 0,
    nextAttemptAt: new Date(0),
    leaseUntil: null,
    claimToken: null,
    processingVersion: null,
    resultRevision: 0,
    mutationEpoch: 0,
    lastError: null,
    syncedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
})
afterEach(() => mock.restoreAll())

test('logs a handled permanent Stripe failure with safe task and request identifiers', async () => {
  const logs: unknown[][] = []
  mock.method(console, 'error', (...args: unknown[]) => {
    logs.push(args)
  })
  mock.method(stripe.products, 'retrieve', async () => {
    throw new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      code: 'parameter_invalid',
      statusCode: 400,
      requestId: 'req_archive42',
      param: 'active',
      message:
        'This price cannot be archived because it is the default price of a product. sk_test_private_placeholder customer@example.invalid',
    })
  })
  await runCatalogSyncBatch()
  assert.equal(item.status, 'FAILED')
  assert.equal(logs.length, 1)
  const details = logs[0]![1] as Record<string, unknown>
  assert.equal(details.productId, '42')
  assert.equal(details.taskId, 'archive-42')
  assert.equal(details.catalogVersion, 4)
  assert.equal(details.operation, 'ARCHIVE')
  assert.equal(details.requestId, 'req_archive42')
  assert.equal(details.code, 'parameter_invalid')
  assert.equal(details.retry, false)
  assert.match(String(details.summary), /default price/i)
  assert.doesNotMatch(
    JSON.stringify(logs),
    /sk_test_private_placeholder|customer@example.invalid/,
  )
})

test('logs a retryable Stripe failure even though the worker handles it without throwing', async () => {
  const logs: unknown[][] = []
  mock.method(console, 'warn', (...args: unknown[]) => {
    logs.push(args)
  })
  mock.method(stripe.products, 'retrieve', async () => {
    throw new Stripe.errors.StripeRateLimitError({
      type: 'rate_limit_error',
      statusCode: 429,
      requestId: 'req_retry42',
      message: 'Rate limit reached',
    })
  })
  await runCatalogSyncBatch()
  assert.equal(item.status, 'PENDING')
  assert.equal(item.attempts, 1)
  assert.equal(logs.length, 1)
  const details = logs[0]![1] as Record<string, unknown>
  assert.equal(details.retry, true)
  assert.equal(details.attempt, 1)
  assert.equal(details.statusCode, 429)
  assert.equal(details.requestId, 'req_retry42')
  assert.ok(details.nextAttemptAt)
})
