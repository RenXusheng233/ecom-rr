import assert from 'node:assert/strict'
import test from 'node:test'
import type { PaymentOrderEvent } from '@repo/types'
import {
  parsePaymentOrderEvent,
  persistPaymentInbox,
  type PaymentInboxRepository,
} from './paymentEvent'

const event: PaymentOrderEvent = {
  id: 'event-1',
  type: 'payment.succeeded',
  schemaVersion: 1,
  occurredAt: '2026-09-18T08:00:00.000Z',
  aggregateId: 'order-1',
  aggregateVersion: 1,
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
}

test('strictly parses a complete lifecycle snapshot and its Kafka key', () => {
  assert.deepEqual(parsePaymentOrderEvent(event, 'order-1'), event)
  assert.throws(() => parsePaymentOrderEvent({ ...event, id: '' }, 'order-1'))
  assert.throws(() => parsePaymentOrderEvent(event, 'another-order'))
  assert.throws(() =>
    parsePaymentOrderEvent(
      {
        ...event,
        data: { ...event.data, amountTotal: Number.MAX_SAFE_INTEGER + 1 },
      },
      'order-1',
    ),
  )
})

test('treats duplicate event IDs as a successful durable Inbox write', async () => {
  const rows: PaymentOrderEvent[] = []
  const repository: PaymentInboxRepository = {
    insert: async (value) => {
      if (rows.some((row) => row.id === value.id)) {
        throw Object.assign(new Error('duplicate'), { code: 11000 })
      }
      rows.push(value)
    },
  }

  await persistPaymentInbox(event, repository)
  await persistPaymentInbox(event, repository)
  assert.equal(rows.length, 1)
})

test('rethrows Inbox database failures so Kafka does not commit the offset', async () => {
  await assert.rejects(
    persistPaymentInbox(event, {
      insert: async () => {
        throw new Error('database unavailable')
      },
    }),
    /database unavailable/,
  )
})
