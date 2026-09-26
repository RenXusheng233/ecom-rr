import assert from 'node:assert/strict'
import test from 'node:test'
import { orderPaymentAppliedEventSchema } from '@repo/types'
import { createOrderAppliedEvent } from './orderWorker'

test('creates a valid acknowledgement for applied and non-created Orders', () => {
  const ack = createOrderAppliedEvent(
    {
      id: 'payment-event-1',
      aggregateId: 'order-1',
      aggregateVersion: 3,
      correlationId: 'attempt-1',
    },
    false,
    {
      eventId: 'ack-1',
      occurredAt: '2026-09-18T08:00:00.000Z',
    },
  )

  assert.equal(ack.data.orderExists, false)
  assert.equal(ack.data.appliedVersion, 3)
  assert.equal(ack.causationId, 'payment-event-1')
  assert.equal(orderPaymentAppliedEventSchema.safeParse(ack).success, true)
})
