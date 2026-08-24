import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CatalogSyncPendingError,
  buildCheckoutLineItems,
  buildCheckoutLineItemsWithFallback,
} from './checkoutCatalog'

test('uses only the synchronized Stripe Price id and client quantity', () => {
  const lineItems = buildCheckoutLineItems(
    [{ id: 42, quantity: 2 }],
    [
      {
        productId: '42',
        status: 'SYNCED',
        desiredVersion: 3,
        appliedVersion: 3,
        stripePriceId: 'price_synced',
        desiredOperation: 'UPSERT',
      },
    ],
  )

  assert.deepEqual(lineItems, [{ price: 'price_synced', quantity: 2 }])
})

test('rejects a product whose desired version is not applied', () => {
  assert.throws(
    () =>
      buildCheckoutLineItems(
        [{ id: 42, quantity: 1 }],
        [
          {
            productId: '42',
            status: 'PENDING',
            desiredVersion: 4,
            appliedVersion: 3,
            stripePriceId: 'price_old',
            desiredOperation: 'UPSERT',
          },
        ],
      ),
    CatalogSyncPendingError,
  )
})

test('rejects an archived item even if a stale Price id remains', () => {
  assert.throws(
    () =>
      buildCheckoutLineItems(
        [{ id: 42, quantity: 1 }],
        [
          {
            productId: '42',
            status: 'SYNCED',
            desiredVersion: 4,
            appliedVersion: 4,
            stripePriceId: 'price_stale',
            desiredOperation: 'ARCHIVE',
          },
        ],
      ),
    CatalogSyncPendingError,
  )
})

test('rejects invalid quantities before creating a Checkout Session', () => {
  assert.throws(
    () => buildCheckoutLineItems([{ id: 42, quantity: 0 }], []),
    /Invalid quantity/,
  )
})

test('uses a server-resolved legacy Price while enforcement is disabled', async () => {
  const lineItems = await buildCheckoutLineItemsWithFallback(
    [{ id: 42, quantity: 2 }],
    [],
    false,
    async (productId) =>
      productId === '42' ? 'price_legacy_server_value' : null,
  )

  assert.deepEqual(lineItems, [
    { price: 'price_legacy_server_value', quantity: 2 },
  ])
})

test('does not use the legacy fallback while enforcement is enabled', async () => {
  await assert.rejects(
    buildCheckoutLineItemsWithFallback(
      [{ id: 42, quantity: 1 }],
      [],
      true,
      async () => 'price_legacy',
    ),
    CatalogSyncPendingError,
  )
})
