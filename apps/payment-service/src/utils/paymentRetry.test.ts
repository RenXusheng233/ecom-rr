import assert from 'node:assert/strict'
import test from 'node:test'
import { getPaymentRetryDecision } from './paymentRetry'

test('retries transient failures with capped exponential backoff', () => {
  const now = new Date('2026-09-18T08:00:00.000Z')
  const decision = getPaymentRetryDecision({ statusCode: 429 }, 2, now, 0)

  assert.equal(decision.retry, true)
  assert.equal(decision.nextAttemptAt?.getTime(), now.getTime() + 10000)
})

test('stops retrying permanent failures and after eight attempts', () => {
  assert.equal(getPaymentRetryDecision({ statusCode: 400 }, 1).retry, false)
  assert.equal(
    getPaymentRetryDecision(new Error('database down'), 8).retry,
    false,
  )
})
