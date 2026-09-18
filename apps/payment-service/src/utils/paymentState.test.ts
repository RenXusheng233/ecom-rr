import assert from 'node:assert/strict'
import test from 'node:test'
import { applyPaymentTransition, type PaymentState } from './paymentState'

const openState: PaymentState = {
  paymentStatus: 'OPEN',
  refundStatus: 'NONE',
  disputeStatus: 'NONE',
  amountTotal: 10000,
  amountRefunded: 0,
}

test('keeps an unpaid completed Checkout in processing', () => {
  const result = applyPaymentTransition(openState, {
    type: 'CHECKOUT_COMPLETED',
    paid: false,
  })

  assert.equal(result.changed, true)
  assert.equal(result.next.paymentStatus, 'PROCESSING')
})

test('does not regress a successful payment after a stale failure', () => {
  const result = applyPaymentTransition(
    { ...openState, paymentStatus: 'SUCCEEDED' },
    { type: 'PAYMENT_FAILED' },
  )

  assert.equal(result.changed, false)
  assert.equal(result.next.paymentStatus, 'SUCCEEDED')
})

test('does not move a terminal failure back to processing', () => {
  for (const paymentStatus of ['FAILED', 'CANCELED', 'EXPIRED'] as const) {
    const result = applyPaymentTransition(
      { ...openState, paymentStatus },
      { type: 'CHECKOUT_COMPLETED', paid: false },
    )

    assert.equal(result.changed, false)
    assert.equal(result.next.paymentStatus, paymentStatus)
  }
})

test('keeps refund and dispute dimensions independent', () => {
  const result = applyPaymentTransition(
    {
      ...openState,
      paymentStatus: 'SUCCEEDED',
      refundStatus: 'PARTIAL',
      amountRefunded: 2500,
    },
    { type: 'DISPUTE_OPENED' },
  )

  assert.equal(result.next.refundStatus, 'PARTIAL')
  assert.equal(result.next.amountRefunded, 2500)
  assert.equal(result.next.disputeStatus, 'OPEN')
})

test('derives partial and full refunds from authoritative totals', () => {
  const paid = { ...openState, paymentStatus: 'SUCCEEDED' as const }
  const partial = applyPaymentTransition(paid, {
    type: 'REFUND_UPDATED',
    amountRefunded: 2000,
  })
  const full = applyPaymentTransition(partial.next, {
    type: 'REFUND_UPDATED',
    amountRefunded: 10000,
  })

  assert.equal(partial.next.refundStatus, 'PARTIAL')
  assert.equal(full.next.refundStatus, 'FULL')
  assert.throws(
    () =>
      applyPaymentTransition(paid, {
        type: 'REFUND_UPDATED',
        amountRefunded: 10001,
      }),
    /exceed/,
  )
})

test('converges when a refund arrives before the payment success event', () => {
  const result = applyPaymentTransition(openState, {
    type: 'REFUND_UPDATED',
    amountRefunded: 2000,
  })

  assert.equal(result.next.paymentStatus, 'SUCCEEDED')
  assert.equal(result.next.refundStatus, 'PARTIAL')
})

test('does not emit another change for an identical final state', () => {
  const state = { ...openState, paymentStatus: 'SUCCEEDED' as const }
  const result = applyPaymentTransition(state, { type: 'PAYMENT_SUCCEEDED' })

  assert.equal(result.changed, false)
  assert.deepEqual(result.next, state)
})

test('does not let a late dispute close overwrite a terminal outcome', () => {
  const won = {
    ...openState,
    paymentStatus: 'SUCCEEDED' as const,
    disputeStatus: 'WON' as const,
  }
  const result = applyPaymentTransition(won, {
    type: 'DISPUTE_CLOSED',
    outcome: 'LOST',
  })

  assert.equal(result.changed, false)
  assert.equal(result.next.disputeStatus, 'WON')
})
