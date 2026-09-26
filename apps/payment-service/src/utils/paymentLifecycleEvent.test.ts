import assert from 'node:assert/strict'
import test from 'node:test'
import { paymentOrderEventSchema } from '@repo/types'
import { createPaymentLifecycleEvent } from './paymentLifecycleEvent'

const attempt = {
  id: 'attempt-1',
  orderId: 'order-1',
  userId: 'user-1',
  paymentStatus: 'SUCCEEDED' as const,
  refundStatus: 'NONE' as const,
  disputeStatus: 'NONE' as const,
  version: 2,
  currency: 'usd',
  amountTotal: 12900,
  amountRefunded: 0,
  itemsSnapshot: [
    {
      productId: 'product-1',
      name: 'T-shirt',
      unitAmount: 12900,
      currency: 'usd',
      stripePriceId: 'price_1',
      quantity: 1,
      selectedSize: 'M',
      selectedColor: 'Black',
    },
  ],
  stripeCheckoutSessionId: 'cs_1',
  stripePaymentIntentId: 'pi_1',
  email: 'buyer@example.com',
  shippingSnapshot: null,
}

test('creates a valid full-snapshot payment lifecycle envelope', () => {
  const event = createPaymentLifecycleEvent(attempt, 'evt_stripe', {
    eventId: 'outbox-1',
    occurredAt: '2026-09-18T08:00:00.000Z',
  })

  assert.equal(event.type, 'payment.succeeded')
  assert.equal(event.aggregateId, 'order-1')
  assert.equal(event.aggregateVersion, 2)
  assert.equal(event.correlationId, 'attempt-1')
  assert.equal(event.causationId, 'evt_stripe')
  assert.equal(event.data.items[0]?.productId, 'product-1')
  assert.equal('stripePriceId' in event.data.items[0]!, false)
  assert.equal(paymentOrderEventSchema.safeParse(event).success, true)
})

test('uses refund and dispute event types without changing the snapshot shape', () => {
  const refunded = createPaymentLifecycleEvent(
    {
      ...attempt,
      refundStatus: 'PARTIAL',
      amountRefunded: 1000,
    },
    'evt_refund',
  )
  const disputed = createPaymentLifecycleEvent(
    { ...attempt, disputeStatus: 'OPEN' },
    'evt_dispute',
  )

  assert.equal(refunded.type, 'payment.partially_refunded')
  assert.equal(disputed.type, 'payment.dispute_opened')
})
