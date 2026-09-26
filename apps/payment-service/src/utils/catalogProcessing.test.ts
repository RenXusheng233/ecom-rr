import assert from 'node:assert/strict'
import test from 'node:test'
import {
  attemptsForCatalogClaim,
  incomingCatalogTaskState,
  shouldFinalizeCatalogAttempt,
} from './catalogProcessing'

test('keeps an active claim when a newer desired version arrives', () => {
  assert.deepEqual(incomingCatalogTaskState('PROCESSING'), {
    status: 'PROCESSING',
  })
})

test('preserves attempts for retrying the same processing version', () => {
  assert.equal(attemptsForCatalogClaim(4, 4, 7), 7)
  assert.equal(attemptsForCatalogClaim(null, 5, 7), 0)
  assert.equal(attemptsForCatalogClaim(4, 5, 7), 0)
})

test('queues immediately when no Stripe operation is active', () => {
  assert.deepEqual(incomingCatalogTaskState('SYNCED'), {
    status: 'PENDING',
    attempts: 0,
    leaseUntil: null,
    claimToken: null,
    processingVersion: null,
    lastError: null,
  })
})

test('only finalizes the version owned by the claim', () => {
  assert.equal(shouldFinalizeCatalogAttempt(4, 4), true)
  assert.equal(shouldFinalizeCatalogAttempt(5, 4), false)
})
