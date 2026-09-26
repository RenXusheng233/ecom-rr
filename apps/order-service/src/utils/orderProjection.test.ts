import assert from 'node:assert/strict'
import test from 'node:test'
import type { PaymentOrderEvent } from '@repo/types'
import { decideOrderProjection } from './orderProjection'

const event = (
  overrides: Partial<PaymentOrderEvent> = {},
): PaymentOrderEvent => ({
  id: 'event-1',
  type: 'payment.succeeded',
  schemaVersion: 1,
  occurredAt: '2026-09-18T08:00:00.000Z',
  aggregateId: 'order-1',
  aggregateVersion: 2,
  correlationId: 'attempt-1',
  causationId: 'stripe-event-1',
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
    shipping: null,
    items: [
      {
        productId: 'product-1',
        name: 'T-shirt',
        unitAmount: 12900,
        quantity: 1,
        selectedSize: 'M',
        selectedColor: 'Black',
      },
    ],
  },
  ...overrides,
})

test('does not create an Order for processing or failed payments', () => {
  const processing = event({
    type: 'payment.processing',
    data: { ...event().data, paymentStatus: 'PROCESSING' },
  })

  assert.deepEqual(decideOrderProjection(null, processing), {
    apply: false,
    next: null,
  })
})

test('creates a successful Order entirely from the server snapshot', () => {
  const decision = decideOrderProjection(null, event())

  assert.equal(decision.apply, true)
  assert.equal(decision.next?.paymentVersion, 2)
  assert.equal(decision.next?.amountTotal, 12900)
  assert.equal(decision.next?.products[0]?.selectedColor, 'Black')
})

test('ignores stale versions and preserves independent refund state', () => {
  const current = decideOrderProjection(null, event()).next!
  assert.equal(
    decideOrderProjection(
      { ...current, paymentVersion: 3 },
      event({ aggregateVersion: 2 }),
    ).apply,
    false,
  )

  const refund = event({
    aggregateVersion: 3,
    type: 'payment.partially_refunded',
    data: {
      ...event().data,
      refundStatus: 'PARTIAL',
      amountRefunded: 2000,
    },
  })
  const dispute = event({
    aggregateVersion: 4,
    type: 'payment.dispute_opened',
    data: {
      ...refund.data,
      disputeStatus: 'OPEN',
    },
  })
  const refunded = decideOrderProjection(current, refund).next!
  const disputed = decideOrderProjection(refunded, dispute).next!

  assert.equal(disputed.refundStatus, 'PARTIAL')
  assert.equal(disputed.disputeStatus, 'OPEN')
})
