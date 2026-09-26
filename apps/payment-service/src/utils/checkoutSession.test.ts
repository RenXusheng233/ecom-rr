import assert from 'node:assert/strict'
import test from 'node:test'
import type { CheckoutRequest } from '@repo/types'
import {
  CheckoutCreationRetryableError,
  IdempotencyKeyReusedError,
  buildStripeCheckoutSessionRequest,
  createOrResumeCheckout,
  type CheckoutAttemptRecord,
  type CheckoutDependencies,
} from './checkoutSession'
import {
  hashCheckoutRequest,
  normalizeCheckoutRequest,
} from './checkoutRequest'

const request: CheckoutRequest = {
  cart: [
    {
      productId: '42',
      quantity: 1,
      selectedSize: '42',
      selectedColor: 'black',
    },
  ],
}

const createHarness = () => {
  const attempts = new Map<string, CheckoutAttemptRecord>()
  const stripeCalls: Array<{ idempotencyKey: string }> = []
  let failNextStripeCall = false
  let failNextConfirmation = false
  let failedAttemptCalls = 0

  const dependencies: CheckoutDependencies = {
    resolveCatalog: async () => ({
      lineItems: [{ price: 'price_1', quantity: 1 }],
      items: [
        {
          productId: '42',
          name: 'Trail shoe',
          unitAmount: 12900,
          currency: 'usd',
          stripePriceId: 'price_1',
          quantity: 1,
          selectedSize: '42',
          selectedColor: 'black',
        },
      ],
      amountTotal: 12900,
      currency: 'usd',
    }),
    findAttempt: async (userId, clientRequestId) =>
      attempts.get(`${userId}:${clientRequestId}`) ?? null,
    createAttempt: async (input) => {
      const attempt: CheckoutAttemptRecord = {
        ...input,
        id: 'attempt-1',
        orderId: 'order-1',
        stripeCheckoutSessionId: null,
        stripeClientSecret: null,
      }
      attempts.set(`${input.userId}:${input.clientRequestId}`, attempt)
      return attempt
    },
    confirmSession: async (input) => {
      if (failNextConfirmation) {
        failNextConfirmation = false
        throw new Error('database unavailable')
      }
      const key = `user-1:request-1`
      const current = attempts.get(key)
      assert.ok(current)
      attempts.set(key, {
        ...current,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripeClientSecret: input.stripeClientSecret,
      })
    },
    failAttempt: async () => {
      failedAttemptCalls += 1
    },
    createStripeSession: async (_input, idempotencyKey) => {
      stripeCalls.push({ idempotencyKey })
      if (failNextStripeCall) {
        failNextStripeCall = false
        throw Object.assign(new Error('network timeout'), {
          type: 'StripeConnectionError',
        })
      }
      return {
        id: 'cs_1',
        clientSecret: 'cs_secret_1',
      }
    },
  }

  return {
    dependencies,
    stripeCalls,
    failStripeOnce: () => {
      failNextStripeCall = true
    },
    failConfirmationOnce: () => {
      failNextConfirmation = true
    },
    failedAttemptCalls: () => failedAttemptCalls,
  }
}

test('enables phone collection for Checkout confirmation', () => {
  const sessionRequest = buildStripeCheckoutSessionRequest({
    userId: 'user-1',
    paymentAttemptId: 'attempt-1',
    orderId: 'order-1',
    lineItems: [{ price: 'price_1', quantity: 1 }],
    returnUrl: 'http://localhost:3000/return?session_id={CHECKOUT_SESSION_ID}',
  })

  assert.deepEqual(sessionRequest.phone_number_collection, { enabled: true })
})

test('normalizes equivalent cart lines before hashing', () => {
  const normalized = normalizeCheckoutRequest({
    cart: [
      { productId: '9', quantity: 1, selectedSize: 'm', selectedColor: 'red' },
      { productId: '2', quantity: 1, selectedSize: 's', selectedColor: 'blue' },
      { productId: '9', quantity: 2, selectedSize: 'm', selectedColor: 'red' },
    ],
  })

  assert.deepEqual(normalized.cart, [
    { productId: '2', quantity: 1, selectedSize: 's', selectedColor: 'blue' },
    { productId: '9', quantity: 3, selectedSize: 'm', selectedColor: 'red' },
  ])
  assert.equal(
    hashCheckoutRequest(normalized),
    hashCheckoutRequest({ cart: [...normalized.cart].reverse() }),
  )
})

test('returns the original Stripe session for the same user request', async () => {
  const harness = createHarness()
  const input = {
    userId: 'user-1',
    clientRequestId: 'request-1',
    request,
    clientAppUrl: 'http://localhost:3000',
  }

  const first = await createOrResumeCheckout(input, harness.dependencies)
  const second = await createOrResumeCheckout(input, harness.dependencies)

  assert.deepEqual(second, first)
  assert.equal(harness.stripeCalls.length, 1)
  assert.equal(
    harness.stripeCalls[0]?.idempotencyKey,
    'checkout-session:attempt-1:v1',
  )
})

test('rejects reuse of an idempotency key with another cart', async () => {
  const harness = createHarness()
  const input = {
    userId: 'user-1',
    clientRequestId: 'request-1',
    request,
    clientAppUrl: 'http://localhost:3000',
  }
  await createOrResumeCheckout(input, harness.dependencies)

  await assert.rejects(
    createOrResumeCheckout(
      {
        ...input,
        request: {
          cart: [{ ...request.cart[0]!, quantity: 2 }],
        },
      },
      harness.dependencies,
    ),
    IdempotencyKeyReusedError,
  )
})

test('rejects a concurrent unique-key winner with another request hash', async () => {
  const harness = createHarness()
  const existingCreate = harness.dependencies.createAttempt
  harness.dependencies.findAttempt = async () => null
  harness.dependencies.createAttempt = async (input) => ({
    ...(await existingCreate(input)),
    requestHash: 'another-request-hash',
  })

  await assert.rejects(
    createOrResumeCheckout(
      {
        userId: 'user-1',
        clientRequestId: 'request-1',
        request,
        clientAppUrl: 'http://localhost:3000',
      },
      harness.dependencies,
    ),
    IdempotencyKeyReusedError,
  )
  assert.equal(harness.stripeCalls.length, 0)
})

test('retries an unknown Stripe result with the same Stripe idempotency key', async () => {
  const harness = createHarness()
  harness.failStripeOnce()
  const input = {
    userId: 'user-1',
    clientRequestId: 'request-1',
    request,
    clientAppUrl: 'http://localhost:3000',
  }

  await assert.rejects(
    createOrResumeCheckout(input, harness.dependencies),
    CheckoutCreationRetryableError,
  )
  const result = await createOrResumeCheckout(input, harness.dependencies)

  assert.equal(result.checkoutSessionClientSecret, 'cs_secret_1')
  assert.deepEqual(
    harness.stripeCalls.map((call) => call.idempotencyKey),
    ['checkout-session:attempt-1:v1', 'checkout-session:attempt-1:v1'],
  )
})

test('retries local confirmation failure without marking a created Stripe session failed', async () => {
  const harness = createHarness()
  harness.failConfirmationOnce()
  const input = {
    userId: 'user-1',
    clientRequestId: 'request-1',
    request,
    clientAppUrl: 'http://localhost:3000',
  }

  await assert.rejects(
    createOrResumeCheckout(input, harness.dependencies),
    CheckoutCreationRetryableError,
  )
  const result = await createOrResumeCheckout(input, harness.dependencies)

  assert.equal(result.checkoutSessionClientSecret, 'cs_secret_1')
  assert.equal(harness.failedAttemptCalls(), 0)
  assert.deepEqual(
    harness.stripeCalls.map((call) => call.idempotencyKey),
    ['checkout-session:attempt-1:v1', 'checkout-session:attempt-1:v1'],
  )
})
