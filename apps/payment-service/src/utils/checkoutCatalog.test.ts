import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCheckoutSnapshot,
  CatalogSyncPendingError,
  InvalidCatalogOptionError,
} from './checkoutCatalog'

const syncedCatalogItem = {
  productId: '42',
  status: 'SYNCED',
  desiredVersion: 3,
  appliedVersion: 3,
  stripePriceId: 'price_synced',
  desiredOperation: 'UPSERT' as const,
  desiredName: 'Trail shoe',
  desiredUnitAmount: 12900,
  desiredCurrency: 'usd',
  desiredSizes: ['41', '42'],
  desiredColors: ['black', 'white'],
}

test('uses only synchronized server catalog values in the Checkout snapshot', () => {
  const result = buildCheckoutSnapshot(
    [
      {
        productId: '42',
        quantity: 2,
        selectedSize: '42',
        selectedColor: 'black',
      },
    ],
    [syncedCatalogItem],
  )

  assert.deepEqual(result, {
    lineItems: [{ price: 'price_synced', quantity: 2 }],
    items: [
      {
        productId: '42',
        name: 'Trail shoe',
        unitAmount: 12900,
        currency: 'usd',
        stripePriceId: 'price_synced',
        quantity: 2,
        selectedSize: '42',
        selectedColor: 'black',
      },
    ],
    amountTotal: 25800,
    currency: 'usd',
  })
})

test('rejects a product whose desired version is not applied', () => {
  assert.throws(
    () =>
      buildCheckoutSnapshot(
        [
          {
            productId: '42',
            quantity: 1,
            selectedSize: '42',
            selectedColor: 'black',
          },
        ],
        [{ ...syncedCatalogItem, status: 'PENDING', desiredVersion: 4 }],
      ),
    CatalogSyncPendingError,
  )
})

test('rejects archived items and invalid quantities', () => {
  assert.throws(
    () =>
      buildCheckoutSnapshot(
        [
          {
            productId: '42',
            quantity: 1,
            selectedSize: '42',
            selectedColor: 'black',
          },
        ],
        [{ ...syncedCatalogItem, desiredOperation: 'ARCHIVE' }],
      ),
    CatalogSyncPendingError,
  )
  assert.throws(
    () =>
      buildCheckoutSnapshot(
        [
          {
            productId: '42',
            quantity: 0,
            selectedSize: '42',
            selectedColor: 'black',
          },
        ],
        [syncedCatalogItem],
      ),
    /Invalid quantity/,
  )
})

test('rejects size and color values absent from the synchronized catalog', () => {
  assert.throws(
    () =>
      buildCheckoutSnapshot(
        [
          {
            productId: '42',
            quantity: 1,
            selectedSize: '48',
            selectedColor: 'black',
          },
        ],
        [syncedCatalogItem],
      ),
    (error) =>
      error instanceof InvalidCatalogOptionError &&
      error.code === 'INVALID_PRODUCT_SIZE',
  )
  assert.throws(
    () =>
      buildCheckoutSnapshot(
        [
          {
            productId: '42',
            quantity: 1,
            selectedSize: '42',
            selectedColor: 'red',
          },
        ],
        [syncedCatalogItem],
      ),
    (error) =>
      error instanceof InvalidCatalogOptionError &&
      error.code === 'INVALID_PRODUCT_COLOR',
  )
})
