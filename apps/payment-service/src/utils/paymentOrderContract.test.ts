import assert from 'node:assert/strict'
import test from 'node:test'
import {
  orderPaymentAppliedEventSchema,
  paymentOrderEventSchema,
} from '@repo/types'

const validPaymentEvent = {
  id: 'event-1',
  type: 'payment.succeeded',
  schemaVersion: 1,
  occurredAt: '2026-09-18T00:00:00.000Z',
  aggregateId: 'order-1',
  aggregateVersion: 2,
  correlationId: 'attempt-1',
  causationId: 'evt_stripe_1',
  data: {
    orderId: 'order-1',
    paymentAttemptId: 'attempt-1',
    userId: 'user-1',
    paymentStatus: 'SUCCEEDED',
    refundStatus: 'NONE',
    disputeStatus: 'NONE',
    amountTotal: 12900,
    amountRefunded: 0,
    currency: 'usd',
    stripeCheckoutSessionId: 'cs_1',
    stripePaymentIntentId: 'pi_1',
    email: 'buyer@example.com',
    shipping: {
      name: 'Buyer',
      line1: '1 Main St',
      line2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    items: [
      {
        productId: '42',
        name: 'Trail shoe',
        unitAmount: 12900,
        quantity: 1,
        selectedSize: '9',
        selectedColor: 'black',
      },
    ],
  },
} as const

test('accepts a complete versioned payment-order event', () => {
  assert.equal(
    paymentOrderEventSchema.safeParse(validPaymentEvent).success,
    true,
  )
})

test('rejects unsafe cents and mismatched order aggregates', () => {
  const unsafeAmount = {
    ...validPaymentEvent,
    data: {
      ...validPaymentEvent.data,
      amountTotal: Number.MAX_SAFE_INTEGER + 1,
    },
  }
  const mismatchedOrder = {
    ...validPaymentEvent,
    data: { ...validPaymentEvent.data, orderId: 'order-2' },
  }

  assert.equal(paymentOrderEventSchema.safeParse(unsafeAmount).success, false)
  assert.equal(
    paymentOrderEventSchema.safeParse(mismatchedOrder).success,
    false,
  )
})

test('accepts an order projection acknowledgement', () => {
  const result = orderPaymentAppliedEventSchema.safeParse({
    id: 'ack-1',
    type: 'order.payment.applied',
    schemaVersion: 1,
    occurredAt: '2026-09-18T00:00:01.000Z',
    aggregateId: 'order-1',
    aggregateVersion: 2,
    correlationId: 'attempt-1',
    causationId: 'event-1',
    data: {
      orderId: 'order-1',
      paymentAttemptId: 'attempt-1',
      appliedVersion: 2,
      orderExists: true,
      appliedAt: '2026-09-18T00:00:01.000Z',
    },
  })

  assert.equal(result.success, true)
})
