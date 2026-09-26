import assert from 'node:assert/strict'
import test from 'node:test'
import {
  needsCheckoutSessionRecovery,
  needsOrderReplay,
  selectStripeReconciliationTruth,
} from './paymentReconciliation'

test('replays only versions not yet confirmed by Order', () => {
  assert.equal(needsOrderReplay(0, null), false)
  assert.equal(needsOrderReplay(2, null), true)
  assert.equal(needsOrderReplay(2, 1), true)
  assert.equal(needsOrderReplay(2, 2), false)
  assert.equal(needsOrderReplay(2, 3), false)
})

test('recovers only attempts whose Stripe session was not durably confirmed', () => {
  assert.equal(needsCheckoutSessionRecovery('CREATING', null), true)
  assert.equal(needsCheckoutSessionRecovery('OPEN', null), false)
  assert.equal(needsCheckoutSessionRecovery('CREATING', 'cs_1'), false)
})

test('prefers authoritative PaymentIntent terminal truth during reconciliation', () => {
  assert.deepEqual(
    selectStripeReconciliationTruth(
      { status: 'complete', paymentStatus: 'unpaid' },
      { status: 'canceled', hasLastPaymentError: false },
    ),
    { eventType: 'payment_intent.canceled', source: 'payment_intent' },
  )
  assert.deepEqual(
    selectStripeReconciliationTruth(
      { status: 'complete', paymentStatus: 'unpaid' },
      { status: 'requires_payment_method', hasLastPaymentError: true },
    ),
    { eventType: 'payment_intent.payment_failed', source: 'payment_intent' },
  )
  assert.deepEqual(
    selectStripeReconciliationTruth(
      { status: 'complete', paymentStatus: 'unpaid' },
      { status: 'processing', hasLastPaymentError: false },
    ),
    { eventType: 'checkout.session.completed', source: 'session' },
  )
})
