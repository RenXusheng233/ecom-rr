import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activePriceIdsToArchive,
  needsNewStripePrice,
} from './stripeCatalogPolicy'

test('creates a new Stripe Price when the amount changed', () => {
  assert.equal(
    needsNewStripePrice(
      { active: true, currency: 'usd', unitAmount: 9900 },
      12900,
    ),
    true,
  )
  assert.equal(
    needsNewStripePrice(
      { active: true, currency: 'usd', unitAmount: 12900 },
      12900,
    ),
    false,
  )
})

test('archives every active Price except the selected default', () => {
  assert.deepEqual(
    activePriceIdsToArchive(
      [
        { id: 'price_old', active: true },
        { id: 'price_current', active: true },
        { id: 'price_inactive', active: false },
      ],
      'price_current',
    ),
    ['price_old'],
  )
})
