import assert from 'node:assert/strict'
import test from 'node:test'
import { needsCatalogOptionBackfill } from './catalogBackfill'

test('requires a new version for a legacy snapshot without sale options', () => {
  assert.equal(
    needsCatalogOptionBackfill({
      product: { name: 'Trail shoe', unitAmount: 12900, currency: 'usd' },
    }),
    true,
  )
})

test('skips a current snapshot that already contains sizes and colors', () => {
  assert.equal(
    needsCatalogOptionBackfill({
      product: {
        name: 'Trail shoe',
        unitAmount: 12900,
        currency: 'usd',
        sizes: ['41', '42'],
        colors: ['black'],
      },
    }),
    false,
  )
})

test('requires a new version when either option array is missing', () => {
  assert.equal(needsCatalogOptionBackfill({ product: { sizes: ['42'] } }), true)
  assert.equal(
    needsCatalogOptionBackfill({ product: { colors: ['black'] } }),
    true,
  )
})
