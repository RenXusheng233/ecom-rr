import assert from 'node:assert/strict'
import test from 'node:test'
import { hasCatalogDrift } from './catalogDrift'

test('detects a stale default Stripe price', () => {
  assert.equal(
    hasCatalogDrift(
      {
        operation: 'UPSERT',
        name: 'Trail shoe',
        unitAmount: 12900,
        catalogVersion: 3,
      },
      {
        exists: true,
        active: true,
        defaultPriceActive: true,
        activePriceCount: 1,
        name: 'Trail shoe',
        unitAmount: 9900,
        catalogVersion: 3,
      },
    ),
    true,
  )
})

test('accepts a matching active Stripe product', () => {
  assert.equal(
    hasCatalogDrift(
      {
        operation: 'UPSERT',
        name: 'Trail shoe',
        unitAmount: 12900,
        catalogVersion: 3,
      },
      {
        exists: true,
        active: true,
        defaultPriceActive: true,
        activePriceCount: 1,
        name: 'Trail shoe',
        unitAmount: 12900,
        catalogVersion: 3,
      },
    ),
    false,
  )
})

test('detects an inactive default Stripe price', () => {
  assert.equal(
    hasCatalogDrift(
      {
        operation: 'UPSERT',
        name: 'Trail shoe',
        unitAmount: 12900,
        catalogVersion: 3,
      },
      {
        exists: true,
        active: true,
        defaultPriceActive: false,
        activePriceCount: 0,
        name: 'Trail shoe',
        unitAmount: 12900,
        catalogVersion: 3,
      },
    ),
    true,
  )
})

test('requires archived products to be inactive or absent', () => {
  const desired = {
    operation: 'ARCHIVE' as const,
    name: null,
    unitAmount: null,
    catalogVersion: 4,
  }

  assert.equal(
    hasCatalogDrift(desired, {
      exists: true,
      active: true,
      defaultPriceActive: true,
      activePriceCount: 1,
      name: 'Trail shoe',
      unitAmount: 12900,
      catalogVersion: 3,
    }),
    true,
  )
  assert.equal(
    hasCatalogDrift(desired, {
      exists: true,
      active: false,
      defaultPriceActive: false,
      activePriceCount: 0,
      name: 'Trail shoe',
      unitAmount: 12900,
      catalogVersion: 3,
    }),
    false,
  )
  assert.equal(
    hasCatalogDrift(desired, {
      exists: true,
      active: false,
      defaultPriceActive: false,
      activePriceCount: 1,
      name: 'Trail shoe',
      unitAmount: 12900,
      catalogVersion: 4,
    }),
    true,
  )
})
