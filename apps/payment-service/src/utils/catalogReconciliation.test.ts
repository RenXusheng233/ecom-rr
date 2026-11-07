import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import type { PrismaClient, StripeCatalogItem } from '@repo/payment-db'
import type { CatalogSyncResultEvent } from '@repo/types'

process.env.STRIPE_SECRET_KEY = 'sk_test_catalog_reconciliation_fake'
process.env.NODE_ENV = 'test'
type FakePrisma = {
  stripeCatalogItem: Record<string, unknown>
  paymentOutboxEvent: Record<string, unknown>
  $queryRaw: () => Promise<unknown[]>
  $transaction: (
    callback: (tx: FakePrisma) => Promise<unknown>,
  ) => Promise<unknown>
}
const fakePrisma: FakePrisma = {
  stripeCatalogItem: {},
  paymentOutboxEvent: {},
  $queryRaw: async () => [],
  $transaction: async (callback) => callback(fakePrisma),
}
;(globalThis as unknown as { paymentPrisma: PrismaClient }).paymentPrisma =
  fakePrisma as unknown as PrismaClient

const { default: stripe } = await import('./stripe')
const { runCatalogReconciliation } = await import('./catalogReconciliation')

afterEach(() => mock.restoreAll())

function fixture() {
  const now = new Date()
  const item: StripeCatalogItem = {
    productId: 'product-1',
    desiredEventId: 'event-1',
    desiredVersion: 1,
    desiredOperation: 'UPSERT',
    desiredName: 'Trail shoe',
    desiredUnitAmount: 12900,
    desiredCurrency: 'usd',
    desiredSizes: [],
    desiredColors: [],
    desiredRunId: 'run-1',
    appliedVersion: 1,
    stripeProductId: 'product-1',
    stripePriceId: 'price-1',
    status: 'SYNCED',
    attempts: 0,
    nextAttemptAt: now,
    leaseUntil: null,
    claimToken: null,
    processingVersion: null,
    resultRevision: 1,
    mutationEpoch: 0,
    lastError: null,
    syncedAt: now,
    createdAt: now,
    updatedAt: now,
  }
  const price = {
    id: 'price-1',
    active: true,
    unit_amount: 12900,
    currency: 'usd',
  }
  const product = {
    id: 'product-1',
    name: 'Trail shoe',
    active: true,
    default_price: price as typeof price | null,
    metadata: { managed_by: 'ecom-rr-payment-service', catalog_version: '1' },
  }
  let known = false
  let snapshot: StripeCatalogItem[] = []
  let afterList = () => {}
  let afterPriceArchive = () => {}
  let afterDefaultClear = () => {}
  let afterProductArchive = () => {}
  const outbox: Array<{ messageKey: string; payload: CatalogSyncResultEvent }> =
    []
  const archived: string[] = []

  const applyUpdate = (data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      const target = item as unknown as Record<string, unknown>
      target[key] =
        value && typeof value === 'object' && 'increment' in value
          ? Number(target[key]) + Number(value.increment)
          : value
    }
  }
  Object.assign(fakePrisma.stripeCatalogItem, {
    findMany: async () => snapshot,
    count: async () => (known ? 1 : 0),
    findUnique: async () => (known ? { ...item } : null),
    update: async ({ data }: { data: Record<string, unknown> }) => {
      applyUpdate(data)
      return item
    },
    updateMany: async ({ data }: { data: Record<string, unknown> }) => {
      applyUpdate(data)
      return { count: 1 }
    },
  })
  Object.assign(fakePrisma.paymentOutboxEvent, {
    create: async ({ data }: { data: (typeof outbox)[number] }) => {
      outbox.push(data)
      return data
    },
  })
  mock.method(stripe.products, 'list', () => ({
    async *[Symbol.asyncIterator]() {
      afterList()
      yield product
    },
  }))
  mock.method(stripe.products, 'retrieve', async () => product)
  mock.method(stripe.prices, 'list', () => ({
    async *[Symbol.asyncIterator]() {
      if (price.active) yield price
    },
  }))
  mock.method(stripe.prices, 'update', async () => {
    if (product.default_price?.id === price.id)
      throw new Error('The default price cannot be archived')
    price.active = false
    archived.push(price.id)
    afterPriceArchive()
    return price
  })
  mock.method(
    stripe.products,
    'update',
    async (
      id: string,
      params: { default_price?: string; active?: boolean },
    ) => {
      assert.equal(id, 'product-1')
      if (params.default_price === '') {
        product.default_price = null
        afterDefaultClear()
      }
      if (params.active === false) {
        product.active = false
        archived.push(product.id)
        afterProductArchive()
      }
      return product
    },
  )
  return {
    item,
    price,
    product,
    outbox,
    archived,
    setKnown: () => {
      known = true
    },
    setSnapshot: () => {
      known = true
      snapshot = [{ ...item }]
    },
    afterList: (callback: () => void) => {
      afterList = callback
    },
    afterPriceArchive: (callback: () => void) => {
      afterPriceArchive = callback
    },
    afterDefaultClear: (callback: () => void) => {
      afterDefaultClear = callback
    },
    afterProductArchive: (callback: () => void) => {
      afterProductArchive = callback
    },
  }
}

test('does not archive a product synchronized after the initial ledger snapshot', async () => {
  const state = fixture()
  state.afterList(state.setKnown)
  const result = await runCatalogReconciliation()
  assert.deepEqual(state.archived, [])
  assert.equal(state.item.status, 'SYNCED')
  assert.equal(result.archivedOrphans, 0)
})

test('stops archiving and durably repairs a product that becomes known during a Price mutation', async () => {
  const state = fixture()
  state.afterPriceArchive(state.setKnown)
  const result = await runCatalogReconciliation()
  assert.deepEqual(state.archived, ['price-1'])
  assert.equal(state.product.active, true)
  assert.equal(state.item.status, 'PENDING')
  assert.equal(state.item.mutationEpoch, 1)
  assert.equal(state.item.resultRevision, 2)
  assert.equal(state.outbox.length, 1)
  assert.equal(state.outbox[0]?.messageKey, 'product-1')
  assert.equal(state.outbox[0]?.payload.status, 'FAILED')
  assert.equal(state.outbox[0]?.payload.resultRevision, 2)
  assert.equal(state.outbox[0]?.payload.catalogVersion, 1)
  assert.equal(result.archivedOrphans, 0)
})

test('repairs a ledger entry arriving while the default price is cleared', async () => {
  const state = fixture()
  state.afterDefaultClear(state.setKnown)
  const result = await runCatalogReconciliation()
  assert.deepEqual(state.archived, [])
  assert.equal(state.price.active, true)
  assert.equal(state.product.active, true)
  assert.equal(state.item.status, 'PENDING')
  assert.equal(state.outbox.length, 1)
  assert.equal(result.archivedOrphans, 0)
})

test('fences a concurrent worker without stealing its active claim', async () => {
  const state = fixture()
  state.item.status = 'PROCESSING'
  state.item.claimToken = 'active-worker'
  state.item.processingVersion = 1
  state.item.leaseUntil = new Date(Date.now() + 60_000)
  state.afterPriceArchive(state.setKnown)
  await runCatalogReconciliation()
  assert.equal(state.item.status, 'PROCESSING')
  assert.equal(state.item.claimToken, 'active-worker')
  assert.equal(state.item.mutationEpoch, 1)
  assert.notEqual(state.item.desiredRunId, 'run-1')
  assert.equal(state.outbox.length, 1)
})

test('repairs a ledger entry arriving during the final Product archive', async () => {
  const state = fixture()
  state.afterProductArchive(state.setKnown)
  const result = await runCatalogReconciliation()
  assert.equal(state.item.status, 'PENDING')
  assert.equal(state.outbox.length, 1)
  assert.equal(result.archivedOrphans, 0)
})

test('repairs potentially applied Stripe mutations even when the response times out', async () => {
  const state = fixture()
  state.afterPriceArchive(() => {
    state.setKnown()
    throw new Error('Stripe response timed out')
  })
  await assert.rejects(runCatalogReconciliation(), /timed out/)
  assert.equal(state.item.status, 'PENDING')
  assert.equal(state.outbox.length, 1)
})

test('archives genuine managed orphans and leaves unmanaged products unchanged', async () => {
  const state = fixture()
  assert.equal((await runCatalogReconciliation()).archivedOrphans, 1)
  assert.deepEqual(state.archived, ['price-1', 'product-1'])
  state.product.active = true
  state.product.metadata.managed_by = 'another-system'
  state.archived.length = 0
  assert.equal((await runCatalogReconciliation()).unmanagedProducts, 1)
  assert.deepEqual(state.archived, [])
})

test('requeues a replacement default Price with an unchanged amount', async () => {
  const state = fixture()
  state.setSnapshot()
  state.price.id = 'replacement-price'
  assert.equal((await runCatalogReconciliation()).drifted, 1)
  assert.equal(state.item.status, 'PENDING')
  assert.notEqual(state.item.desiredRunId, 'run-1')
  assert.deepEqual(state.archived, [])
})

test('does not requeue a matching confirmed default Price', async () => {
  const state = fixture()
  state.setSnapshot()
  assert.equal((await runCatalogReconciliation()).drifted, 0)
  assert.equal(state.item.status, 'SYNCED')
  assert.deepEqual(state.archived, [])
})
