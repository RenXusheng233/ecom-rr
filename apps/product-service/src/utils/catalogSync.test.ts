import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateOutboxRetryMs,
  createCatalogSyncRequestedEvent,
  isCurrentCatalogResult,
  shouldApplyCatalogResult,
} from './catalogSync'

test('builds a complete UPSERT event using cents', () => {
  const event = createCatalogSyncRequestedEvent({
    eventId: 'event-1',
    occurredAt: new Date('2026-08-24T00:00:00.000Z'),
    productId: 42,
    catalogVersion: 3,
    operation: 'UPSERT',
    name: 'Trail shoe',
    price: 129,
  })

  assert.deepEqual(event, {
    eventId: 'event-1',
    occurredAt: '2026-08-24T00:00:00.000Z',
    productId: '42',
    catalogVersion: 3,
    operation: 'UPSERT',
    product: {
      name: 'Trail shoe',
      unitAmount: 12900,
      currency: 'usd',
    },
  })
})

test('ignores an older result revision for the same catalog version', () => {
  assert.equal(shouldApplyCatalogResult(3, 3, 2, 3), true)
  assert.equal(shouldApplyCatalogResult(3, 3, 3, 2), false)
  assert.equal(shouldApplyCatalogResult(4, 3, 0, 5), false)
})

test('builds an ARCHIVE event without a product snapshot', () => {
  const event = createCatalogSyncRequestedEvent({
    eventId: 'event-2',
    occurredAt: new Date('2026-08-24T00:00:00.000Z'),
    productId: 42,
    catalogVersion: 4,
    operation: 'ARCHIVE',
  })

  assert.equal(event.product, null)
})

test('caps outbox retry delay at five minutes', () => {
  assert.equal(calculateOutboxRetryMs(1), 1000)
  assert.equal(calculateOutboxRetryMs(3), 4000)
  assert.equal(calculateOutboxRetryMs(20), 300000)
})

test('accepts only results for the current catalog version', () => {
  assert.equal(isCurrentCatalogResult(3, 3), true)
  assert.equal(isCurrentCatalogResult(4, 3), false)
})
