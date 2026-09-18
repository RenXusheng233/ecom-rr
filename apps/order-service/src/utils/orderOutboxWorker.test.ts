import assert from 'node:assert/strict'
import test from 'node:test'
import { publishOrderOutboxEvent } from './orderOutboxWorker'

test('publishes an Order acknowledgement with its stable aggregate key', async () => {
  const calls: unknown[][] = []
  await publishOrderOutboxEvent(
    {
      topic: 'order.payment.applied',
      messageKey: 'order-1',
      eventType: 'order.payment.applied',
      schemaVersion: 1,
      payload: { id: 'ack-1' },
    },
    async (...args) => {
      calls.push(args)
    },
  )

  assert.deepEqual(calls, [
    [
      'order.payment.applied',
      { id: 'ack-1' },
      {
        key: 'order-1',
        headers: {
          eventType: 'order.payment.applied',
          schemaVersion: '1',
        },
      },
    ],
  ])
})
