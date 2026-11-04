import assert from 'node:assert/strict'
import test from 'node:test'
import type { CatalogArchiveState, ProductDeletionTask } from '@repo/types'
import * as deletion from './product-deletions'

const task: ProductDeletionTask = {
  taskId: 'archive-42',
  productId: 42,
  catalogVersion: 4,
  deletedAt: '2026-11-04T00:00:00.000Z',
  dispatchStatus: 'PUBLISHED',
  dispatchError: null,
}
const synced: CatalogArchiveState = {
  productId: '42',
  desiredEventId: 'archive-42',
  desiredVersion: 4,
  desiredOperation: 'ARCHIVE',
  appliedVersion: 4,
  status: 'SYNCED',
  lastError: null,
}

for (const status of ['PENDING', 'PROCESSING'] as const) {
  test(`keeps the sanitized Stripe failure visible while ${status} is retried automatically`, () => {
    const result = deletion.resolveDeletionStatus(task, {
      ...synced,
      status,
      lastError: 'The payment service could not reach Stripe.',
    })
    assert.equal(result.archiveStatus, 'PROCESSING')
    assert.match(result.archiveError!, /could not reach Stripe/)
    assert.match(result.archiveError!, /automatically/i)
  })
}
for (const [label, state, available, expected] of [
  ['matching completed archive', synced, true, 'ARCHIVED'],
  [
    'older UPSERT success',
    {
      ...synced,
      desiredOperation: 'UPSERT',
      desiredVersion: 3,
      appliedVersion: 3,
    },
    true,
    'WAITING',
  ],
  ['no payment record yet', undefined, true, 'WAITING'],
  ['pending archive', { ...synced, status: 'PENDING' }, true, 'PROCESSING'],
  [
    'processing archive',
    { ...synced, status: 'PROCESSING' },
    true,
    'PROCESSING',
  ],
  [
    'unapplied archive version',
    { ...synced, appliedVersion: 3 },
    true,
    'PROCESSING',
  ],
  ['failed archive', { ...synced, status: 'FAILED' }, true, 'FAILED'],
  [
    'wrong event',
    { ...synced, desiredEventId: 'another-event' },
    true,
    'UNAVAILABLE',
  ],
  ['wrong product', { ...synced, productId: '43' }, true, 'UNAVAILABLE'],
  [
    'wrong operation',
    { ...synced, desiredOperation: 'UPSERT' },
    true,
    'UNAVAILABLE',
  ],
  ['newer version', { ...synced, desiredVersion: 5 }, true, 'UNAVAILABLE'],
  ['unavailable payment service', synced, false, 'UNAVAILABLE'],
] as const) {
  test(`reports ${expected} for ${label}`, () => {
    const result = deletion.resolveDeletionStatus(task, state, available)
    assert.equal(result.archiveStatus, expected)
    assert.equal(result.taskId, 'archive-42')
  })
}

test('loads one durable task page and uses a single payment batch request', async () => {
  const calls: string[] = []
  const fetcher: typeof fetch = async (url, options) => {
    calls.push(String(url))
    if (calls.length === 1) {
      assert.match(String(url), /cursor=previous-task/)
      return Response.json({ tasks: [task], nextCursor: 'archive-42' })
    }
    assert.deepEqual(JSON.parse(options!.body as string), {
      productIds: ['42'],
    })
    assert.equal(
      (options!.headers as Record<string, string>).Authorization,
      'Bearer test-token',
    )
    return Response.json({ items: [synced] })
  }
  const result = await deletion.loadDeletionStatuses(
    {
      token: 'test-token',
      cursor: 'previous-task',
      productServiceUrl: 'http://product',
      paymentServiceUrl: 'http://payment',
    },
    fetcher,
  )
  assert.equal(calls.length, 2)
  assert.equal(result.tasks[0]!.archiveStatus, 'ARCHIVED')
  assert.equal(result.nextCursor, 'archive-42')
})

test('retains durable tasks when payment is unavailable', async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    if (++calls === 1) return Response.json({ tasks: [task], nextCursor: null })
    throw new Error('Connection unavailable')
  }
  const result = await deletion.loadDeletionStatuses(
    {
      token: 'test-token',
      productServiceUrl: 'http://product',
      paymentServiceUrl: 'http://payment',
    },
    fetcher,
  )
  assert.equal(result.tasks[0]!.taskId, 'archive-42')
  assert.equal(result.tasks[0]!.archiveStatus, 'UNAVAILABLE')
})

test('reports a task-list failure instead of pretending no deletions exist', async () => {
  await assert.rejects(
    deletion.loadDeletionStatuses(
      {
        token: 'test-token',
        productServiceUrl: 'http://product',
        paymentServiceUrl: 'http://payment',
      },
      async () => new Response(null, { status: 503 }),
    ),
    /load/i,
  )
})

test('keeps per-product successes and failures in a partially successful batch', async () => {
  const products = [
    { id: 42, name: 'Shoe' },
    { id: 43, name: 'Shirt' },
    { id: 44, name: 'Bag' },
  ]
  const calls: number[] = []
  const result = await deletion.deleteProductBatch(products, async (id) => {
    calls.push(id)
    if (id === 43) throw new Error('Product could not be deleted')
  })
  assert.deepEqual(calls, [42, 43, 44])
  assert.deepEqual(result.deletedIds, [42, 44])
  assert.deepEqual(result.failures, [
    { id: 43, name: 'Shirt', error: 'Product could not be deleted' },
  ])
})

test('bounds simultaneous delete requests when selecting many products', async () => {
  let active = 0
  let peak = 0
  const result = await deletion.deleteProductBatch(
    Array.from({ length: 11 }, (_, index) => ({
      id: index + 1,
      name: 'Product',
    })),
    async () => {
      peak = Math.max(peak, ++active)
      await new Promise<void>((resolve) => setImmediate(resolve))
      active--
    },
  )
  assert.ok(peak <= 4)
  assert.equal(result.deletedIds.length, 11)
})
