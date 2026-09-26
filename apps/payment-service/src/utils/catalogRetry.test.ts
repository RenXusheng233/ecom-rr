import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getCatalogRetryDecision,
  shouldRotateSyncRunAfterFailure,
} from './catalogRetry'

test('retries transient Stripe failures with capped exponential backoff', () => {
  const now = new Date('2026-08-24T00:00:00.000Z')
  const decision = getCatalogRetryDecision(
    { type: 'StripeRateLimitError', statusCode: 429 },
    3,
    now,
    0,
  )

  assert.deepEqual(decision, {
    retry: true,
    nextAttemptAt: new Date('2026-08-24T00:00:20.000Z'),
  })
})

test('stops retrying permanent Stripe failures immediately', () => {
  const decision = getCatalogRetryDecision(
    { type: 'StripeInvalidRequestError', statusCode: 400 },
    1,
    new Date('2026-08-24T00:00:00.000Z'),
    0,
  )

  assert.deepEqual(decision, { retry: false, nextAttemptAt: null })
})

test('stops after eight transient attempts', () => {
  const decision = getCatalogRetryDecision(
    { type: 'StripeConnectionError' },
    8,
    new Date('2026-08-24T00:00:00.000Z'),
    0,
  )

  assert.deepEqual(decision, { retry: false, nextAttemptAt: null })
})

test('rotates a sync run after a cached server failure but not a connection error', () => {
  assert.equal(shouldRotateSyncRunAfterFailure({ statusCode: 500 }), true)
  assert.equal(
    shouldRotateSyncRunAfterFailure({ type: 'StripeConnectionError' }),
    false,
  )
})
