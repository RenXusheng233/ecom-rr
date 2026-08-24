import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldApplyCatalogEvent } from './catalogEvent'

test('applies the first catalog event', () => {
  assert.equal(shouldApplyCatalogEvent(null, 1), true)
})

test('ignores duplicate and out-of-order catalog events', () => {
  assert.equal(shouldApplyCatalogEvent(3, 3), false)
  assert.equal(shouldApplyCatalogEvent(3, 2), false)
  assert.equal(shouldApplyCatalogEvent(3, 4), true)
})
