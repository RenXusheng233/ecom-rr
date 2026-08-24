import assert from 'node:assert/strict'
import test from 'node:test'
import type { Kafka } from 'kafkajs'
import { createProducer } from './producer'

test('send preserves the aggregate key and headers', async () => {
  let request: unknown
  const kafka = {
    producer: () => ({
      connect: async () => undefined,
      disconnect: async () => undefined,
      send: async (value: unknown) => {
        request = value
        return []
      },
    }),
  } as unknown as Kafka

  const producer = createProducer(kafka)

  await producer.send(
    'catalog.product.sync.requested',
    { eventId: 'event-1' },
    { key: '42', headers: { eventType: 'catalog-sync-requested' } },
  )

  assert.deepEqual(request, {
    topic: 'catalog.product.sync.requested',
    messages: [
      {
        key: '42',
        value: JSON.stringify({ eventId: 'event-1' }),
        headers: { eventType: 'catalog-sync-requested' },
      },
    ],
  })
})
