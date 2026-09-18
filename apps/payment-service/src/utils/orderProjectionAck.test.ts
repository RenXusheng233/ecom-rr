import assert from 'node:assert/strict'
import test from 'node:test'
import { nextOrderProjection } from './orderProjectionAck'

test('advances order projection only for a newer applied version', () => {
  assert.deepEqual(nextOrderProjection(null, 2, true, 3), {
    advance: true,
    orderAppliedVersion: 2,
    orderExists: true,
  })
  assert.deepEqual(nextOrderProjection(3, 2, false, 4), { advance: false })
  assert.deepEqual(nextOrderProjection(3, 3, false, 4), { advance: false })
  assert.deepEqual(nextOrderProjection(3, 4, false, 4), {
    advance: true,
    orderAppliedVersion: 4,
    orderExists: false,
  })
})

test('rejects an acknowledgement newer than the payment aggregate', () => {
  assert.deepEqual(nextOrderProjection(2, 99, true, 3), { advance: false })
})
