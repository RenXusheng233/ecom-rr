import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchCatalogOutboxEvent } from './catalogOutbox'

test('keeps an outbox event pending when Kafka publishing fails', async () => {
  const state = {
    status: 'PENDING',
    attempts: 0,
    nextAttemptAt: new Date(0),
    error: null as string | null,
  }

  await dispatchCatalogOutboxEvent(
    {
      id: 'event-1',
      aggregateId: '42',
      attempts: 0,
      payload: { eventId: 'event-1' },
    },
    {
      publish: async () => {
        throw new Error('Kafka unavailable')
      },
      markPublished: async () => {
        state.status = 'PUBLISHED'
      },
      markFailedAttempt: async ({ nextAttemptAt, error }) => {
        state.attempts += 1
        state.nextAttemptAt = nextAttemptAt
        state.error = error
      },
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    },
  )

  assert.deepEqual(state, {
    status: 'PENDING',
    attempts: 1,
    nextAttemptAt: new Date('2026-08-24T00:00:01.000Z'),
    error: 'Kafka unavailable',
  })
})

test('marks an outbox event published only after Kafka succeeds', async () => {
  let status = 'PENDING'

  await dispatchCatalogOutboxEvent(
    {
      id: 'event-1',
      aggregateId: '42',
      attempts: 0,
      payload: { eventId: 'event-1' },
    },
    {
      publish: async () => undefined,
      markPublished: async () => {
        status = 'PUBLISHED'
      },
      markFailedAttempt: async () => undefined,
      now: () => new Date('2026-08-24T00:00:00.000Z'),
    },
  )

  assert.equal(status, 'PUBLISHED')
})
