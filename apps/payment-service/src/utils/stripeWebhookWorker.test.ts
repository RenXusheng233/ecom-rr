import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PermanentWebhookError,
  projectStripePaymentEvent,
} from './stripeWebhookWorker'
import type { NormalizedStripePaymentEvent } from './stripeWebhookEvent'

const attempt = {
  id: 'attempt-1',
  orderId: 'order-1',
  userId: 'user-1',
  paymentStatus: 'OPEN' as const,
  refundStatus: 'NONE' as const,
  disputeStatus: 'NONE' as const,
  version: 0,
  currency: 'usd',
  amountTotal: 12900,
  amountRefunded: 0,
  itemsSnapshot: [],
  email: null,
  shippingSnapshot: null,
  stripeCheckoutSessionId: 'cs_1',
  stripePaymentIntentId: null,
  lastStripeEventCreatedAt: null,
}

const paymentEvent: NormalizedStripePaymentEvent = {
  kind: 'PAYMENT',
  eventId: 'evt_1',
  eventType: 'payment_intent.succeeded',
  stripeCreatedAt: new Date('2026-09-18T08:00:00.000Z'),
  command: { type: 'PAYMENT_SUCCEEDED' },
  paymentAttemptId: 'attempt-1',
  userId: 'user-1',
  amountTotal: 12900,
  currency: 'usd',
  stripeCheckoutSessionId: null,
  stripePaymentIntentId: 'pi_1',
  stripeChargeId: null,
  email: null,
  shipping: null,
}

test('projects state and Stripe identifiers as one externally visible change', () => {
  const result = projectStripePaymentEvent(attempt, paymentEvent)

  assert.equal(result.changed, true)
  assert.equal(result.next.paymentStatus, 'SUCCEEDED')
  assert.equal(result.next.stripePaymentIntentId, 'pi_1')
  assert.equal(result.next.version, 1)
})

test('publishes a later checkout snapshot even if payment already succeeded', () => {
  const completed = projectStripePaymentEvent(
    {
      ...attempt,
      paymentStatus: 'SUCCEEDED',
      stripePaymentIntentId: 'pi_1',
      version: 1,
    },
    {
      ...paymentEvent,
      eventId: 'evt_2',
      eventType: 'checkout.session.completed',
      command: { type: 'CHECKOUT_COMPLETED', paid: true },
      stripeCheckoutSessionId: 'cs_1',
      email: 'buyer@example.com',
      shipping: {
        name: 'Buyer',
        line1: '1 Main St',
        line2: null,
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      },
    },
  )

  assert.equal(completed.changed, true)
  assert.equal(completed.next.version, 2)
  assert.equal(completed.next.email, 'buyer@example.com')
  assert.equal(completed.next.shippingSnapshot?.postalCode, '78701')
})

test('does not create another aggregate version for a duplicate projection', () => {
  const current = {
    ...attempt,
    paymentStatus: 'SUCCEEDED' as const,
    stripePaymentIntentId: 'pi_1',
    version: 1,
  }
  const result = projectStripePaymentEvent(current, paymentEvent)

  assert.equal(result.changed, false)
  assert.equal(result.next.version, 1)
})

test('rejects mismatched ownership, amount, currency and Stripe identifiers', () => {
  assert.throws(
    () =>
      projectStripePaymentEvent(attempt, {
        ...paymentEvent,
        userId: 'another-user',
      }),
    PermanentWebhookError,
  )
  assert.throws(
    () =>
      projectStripePaymentEvent(attempt, {
        ...paymentEvent,
        amountTotal: 999,
      }),
    PermanentWebhookError,
  )
  assert.throws(
    () =>
      projectStripePaymentEvent(attempt, {
        ...paymentEvent,
        currency: 'eur',
      }),
    PermanentWebhookError,
  )
  assert.throws(
    () =>
      projectStripePaymentEvent(
        { ...attempt, stripePaymentIntentId: 'pi_existing' },
        paymentEvent,
      ),
    PermanentWebhookError,
  )
})

test('ignores an older payment-state transition while retaining the newer fence', () => {
  const result = projectStripePaymentEvent(
    {
      ...attempt,
      paymentStatus: 'EXPIRED',
      version: 1,
      lastStripeEventCreatedAt: new Date('2026-09-18T09:00:00.000Z'),
    },
    {
      ...paymentEvent,
      eventId: 'evt_old',
      eventType: 'checkout.session.completed',
      stripeCreatedAt: new Date('2026-09-18T08:00:00.000Z'),
      command: { type: 'CHECKOUT_COMPLETED', paid: false },
      stripePaymentIntentId: null,
    },
  )

  assert.equal(result.changed, false)
  assert.equal(result.next.paymentStatus, 'EXPIRED')
  assert.equal(
    result.next.lastStripeEventCreatedAt?.toISOString(),
    '2026-09-18T09:00:00.000Z',
  )
})
