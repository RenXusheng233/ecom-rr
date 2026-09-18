import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { normalizeStripeEvent } from './stripeWebhookEvent'

test('normalizes an unpaid completed Checkout as processing with its snapshot', () => {
  const normalized = normalizeStripeEvent({
    id: 'evt_1',
    type: 'checkout.session.completed',
    created: 1789689600,
    data: {
      object: {
        id: 'cs_1',
        object: 'checkout.session',
        payment_status: 'unpaid',
        payment_intent: 'pi_1',
        amount_total: 12900,
        currency: 'usd',
        client_reference_id: 'user-1',
        metadata: { paymentAttemptId: 'attempt-1' },
        customer_details: { email: 'buyer@example.com' },
        collected_information: {
          shipping_details: {
            name: 'Buyer',
            address: {
              line1: '1 Main St',
              line2: null,
              city: 'Austin',
              state: 'TX',
              postal_code: '78701',
              country: 'US',
            },
          },
        },
      },
    },
  } as unknown as Stripe.Event)

  assert.equal(normalized.kind, 'PAYMENT')
  if (normalized.kind !== 'PAYMENT') return
  assert.deepEqual(normalized.command, {
    type: 'CHECKOUT_COMPLETED',
    paid: false,
  })
  assert.equal(normalized.paymentAttemptId, 'attempt-1')
  assert.equal(normalized.stripeCheckoutSessionId, 'cs_1')
  assert.equal(normalized.stripePaymentIntentId, 'pi_1')
  assert.equal(normalized.shipping?.postalCode, '78701')
})

test('treats a no-payment-required Checkout as successful', () => {
  const normalized = normalizeStripeEvent({
    id: 'evt_free',
    type: 'checkout.session.completed',
    created: 1789689600,
    data: {
      object: {
        id: 'cs_free',
        object: 'checkout.session',
        payment_status: 'no_payment_required',
        payment_intent: null,
        amount_total: 0,
        currency: 'usd',
        client_reference_id: 'user-1',
        metadata: { paymentAttemptId: 'attempt-1' },
      },
    },
  } as unknown as Stripe.Event)

  assert.equal(normalized.kind, 'PAYMENT')
  if (normalized.kind !== 'PAYMENT') return
  assert.deepEqual(normalized.command, {
    type: 'CHECKOUT_COMPLETED',
    paid: true,
  })
})

test('normalizes refunds from authoritative charge amounts', () => {
  const normalized = normalizeStripeEvent({
    id: 'evt_refund',
    type: 'charge.refunded',
    created: 1789689601,
    data: {
      object: {
        id: 'ch_1',
        object: 'charge',
        amount: 10000,
        amount_refunded: 2500,
        currency: 'usd',
        payment_intent: 'pi_1',
        metadata: { paymentAttemptId: 'attempt-1' },
      },
    },
  } as unknown as Stripe.Event)

  assert.equal(normalized.kind, 'PAYMENT')
  if (normalized.kind !== 'PAYMENT') return
  assert.deepEqual(normalized.command, {
    type: 'REFUND_UPDATED',
    amountRefunded: 2500,
  })
})

test('ignores Stripe event types outside the payment-order contract', () => {
  const normalized = normalizeStripeEvent({
    id: 'evt_customer',
    type: 'customer.updated',
    created: 1789689602,
    data: { object: { id: 'cus_1', object: 'customer' } },
  } as unknown as Stripe.Event)

  assert.deepEqual(normalized, {
    kind: 'IGNORED',
    eventId: 'evt_customer',
    eventType: 'customer.updated',
  })
})
