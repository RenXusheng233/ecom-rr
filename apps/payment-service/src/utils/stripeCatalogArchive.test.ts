import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import Stripe from 'stripe'

process.env.STRIPE_SECRET_KEY = 'sk_test_catalog_archive_fake'
const { default: stripe } = await import('./stripe')
const { archiveStripeCatalogItem } = await import('./stripeCatalog')
afterEach(() => mock.restoreAll())

test('clears the default price before archiving it', async () => {
  let defaultPrice: string | null = 'price-default'
  const operations: string[] = []
  mock.method(stripe.products, 'retrieve', async () => ({
    id: '42',
    default_price: { id: 'price-default', active: true },
  }))
  mock.method(stripe.prices, 'list', () =>
    (async function* () {
      yield { id: 'price-default' }
      yield { id: 'price-other' }
    })(),
  )
  mock.method(
    stripe.products,
    'update',
    async (
      id: string,
      params: { default_price?: string; active?: boolean },
    ) => {
      assert.equal(id, '42')
      if (params.default_price === '') {
        defaultPrice = null
        operations.push('clear-default')
      } else {
        assert.equal(params.active, false)
        operations.push('archive-product')
      }
    },
  )
  mock.method(stripe.prices, 'update', async (id: string) => {
    if (id === defaultPrice)
      throw new Stripe.errors.StripeInvalidRequestError({
        type: 'invalid_request_error',
        statusCode: 400,
        message:
          'This price cannot be archived because it is the default price of a product.',
      })
    operations.push(id)
  })
  const result = await archiveStripeCatalogItem('42', 4, 'archive-42')
  assert.deepEqual(operations, [
    'clear-default',
    'price-default',
    'price-other',
    'archive-product',
  ])
  assert.deepEqual(result, { stripeProductId: '42', stripePriceId: null })
})

test('archives every active price before archiving the Stripe product', async () => {
  const operations: string[] = []
  mock.method(stripe.products, 'retrieve', async () => ({ id: '42' }))
  mock.method(stripe.prices, 'list', (args: unknown) => {
    assert.deepEqual(args, { product: '42', active: true, limit: 100 })
    return (async function* () {
      yield { id: 'price-1' }
      yield { id: 'price-2' }
    })()
  })
  mock.method(stripe.prices, 'update', async (id: string, params: unknown) => {
    assert.deepEqual(params, { active: false })
    operations.push(id)
  })
  mock.method(
    stripe.products,
    'update',
    async (id: string, params: { active: boolean }) => {
      assert.equal(params.active, false)
      operations.push(`product-${id}`)
    },
  )
  const result = await archiveStripeCatalogItem('42', 4, 'archive-42')
  assert.deepEqual(operations, ['price-1', 'price-2', 'product-42'])
  assert.deepEqual(result, { stripeProductId: '42', stripePriceId: null })
})

test('finishes an archive successfully when the Stripe product was never created', async () => {
  mock.method(stripe.products, 'retrieve', async () => {
    throw new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'Missing product',
      statusCode: 404,
    })
  })
  const result = await archiveStripeCatalogItem('42', 4, 'archive-42')
  assert.deepEqual(result, { stripeProductId: '42', stripePriceId: null })
})
