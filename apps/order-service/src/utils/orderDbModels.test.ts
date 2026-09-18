import assert from 'node:assert/strict'
import test from 'node:test'
import type { IndexDefinition, IndexOptions } from 'mongoose'
import {
  Order,
  OrderOutboxEvent,
  PaymentEventInbox,
  RejectedPaymentEvent,
} from '@repo/order-db'

const hasUniqueIndex = (
  indexes: Array<[IndexDefinition, IndexOptions]>,
  field: string,
) =>
  indexes.some(
    ([keys, options]: [IndexDefinition, IndexOptions]) =>
      keys[field] === 1 && options.unique === true,
  )

test('defines stable unique identities for the Order projection', () => {
  assert.equal(Order.schema.path('orderId')?.options.required, true)
  const indexes = Order.schema.indexes()
  assert.equal(hasUniqueIndex(indexes, 'orderId'), true)
  assert.equal(hasUniqueIndex(indexes, 'paymentAttemptId'), true)
  assert.equal(hasUniqueIndex(indexes, 'stripeCheckoutSessionId'), true)
  assert.equal(
    indexes.some(
      ([keys, options]: [IndexDefinition, IndexOptions]) =>
        keys.stripePaymentIntentId === 1 &&
        options.unique === true &&
        Boolean(options.partialFilterExpression),
    ),
    true,
  )
})

test('defines unique Inbox, Outbox and poison-message identities', () => {
  assert.equal(
    hasUniqueIndex(PaymentEventInbox.schema.indexes(), 'eventId'),
    true,
  )
  assert.equal(
    hasUniqueIndex(OrderOutboxEvent.schema.indexes(), 'eventId'),
    true,
  )
  assert.equal(
    hasUniqueIndex(RejectedPaymentEvent.schema.indexes(), 'kafkaCoordinate'),
    true,
  )
  assert.equal(
    RejectedPaymentEvent.schema
      .indexes()
      .some(
        ([keys, options]: [IndexDefinition, IndexOptions]) =>
          keys.expiresAt === 1 && options.expireAfterSeconds === 0,
      ),
    true,
  )
})
