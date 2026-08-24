import assert from 'node:assert/strict'
import test from 'node:test'
import { executeCatalogSyncAttempt } from './catalogAttempt'

test('does not classify a database confirmation failure as a Stripe failure', async () => {
  let failureHandled = false

  await assert.rejects(
    executeCatalogSyncAttempt({
      runStripeOperation: async () => ({ priceId: 'price_1' }),
      persistSuccess: async () => {
        throw new Error('database unavailable')
      },
      handleStripeFailure: async () => {
        failureHandled = true
      },
    }),
    /database unavailable/,
  )

  assert.equal(failureHandled, false)
})

test('handles a Stripe failure without persisting success', async () => {
  let state = 'PROCESSING'

  await executeCatalogSyncAttempt({
    runStripeOperation: async () => {
      throw new Error('Stripe rejected request')
    },
    persistSuccess: async () => {
      state = 'SYNCED'
    },
    handleStripeFailure: async () => {
      state = 'FAILED'
    },
  })

  assert.equal(state, 'FAILED')
})
