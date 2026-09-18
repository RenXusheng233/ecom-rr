import assert from 'node:assert/strict'
import test from 'node:test'
import { publishPaymentOutboxEvent } from './paymentOutboxWorker'

test('publishes using routing stored with each outbox row', async () => {
  const calls: unknown[][] = []
  await publishPaymentOutboxEvent(
    {
      topic: 'payment.order.lifecycle',
      messageKey: 'order-1',
      eventType: 'payment.succeeded',
      schemaVersion: 1,
      payload: { id: 'event-1' },
    },
    async (...args) => {
      calls.push(args)
    },
  )

  assert.deepEqual(calls, [
    [
      'payment.order.lifecycle',
      { id: 'event-1' },
      {
        key: 'order-1',
        headers: {
          eventType: 'payment.succeeded',
          schemaVersion: '1',
        },
      },
    ],
  ])
})
