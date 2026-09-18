import assert from 'node:assert/strict'
import test from 'node:test'
import { createMiddleware } from 'hono/factory'
import { createSessionRoute } from './session.route'

const auth = createMiddleware<{ Variables: { userId: string } }>(
  async (context, next) => {
    context.set('userId', 'user-1')
    await next()
  },
)

test('requires a UUID Idempotency-Key before creating Checkout', async () => {
  const route = createSessionRoute(
    {
      createCheckout: async () => assert.fail('must not create Checkout'),
      findSessionStatus: async () => null,
    },
    auth,
  )

  const response = await route.request('/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cart: [] }),
  })

  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'IDEMPOTENCY_KEY_REQUIRED')
})

test('returns the reliable Checkout identifiers from the application service', async () => {
  const route = createSessionRoute(
    {
      createCheckout: async (input) => {
        assert.equal(input.userId, 'user-1')
        assert.equal(
          input.clientRequestId,
          '11111111-1111-4111-8111-111111111111',
        )
        return {
          checkoutSessionClientSecret: 'cs_secret_1',
          paymentAttemptId: 'attempt-1',
          orderId: 'order-1',
        }
      },
      findSessionStatus: async () => null,
    },
    auth,
  )

  const response = await route.request('/create-checkout-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
    },
    body: JSON.stringify({
      cart: [
        {
          productId: '42',
          quantity: 1,
          selectedSize: '42',
          selectedColor: 'black',
        },
      ],
    }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    checkoutSessionClientSecret: 'cs_secret_1',
    paymentAttemptId: 'attempt-1',
    orderId: 'order-1',
  })
})

test('does not disclose a Checkout Session owned by another user', async () => {
  const route = createSessionRoute(
    {
      createCheckout: async () => assert.fail('must not create Checkout'),
      findSessionStatus: async () => null,
    },
    auth,
  )

  const response = await route.request('/cs_another_user')

  assert.equal(response.status, 404)
  assert.equal((await response.json()).error.code, 'CHECKOUT_SESSION_NOT_FOUND')
})
