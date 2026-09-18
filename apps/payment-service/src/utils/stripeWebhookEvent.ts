import type Stripe from 'stripe'
import type { ShippingSnapshot } from '@repo/types'
import type { PaymentCommand } from './paymentState'

export type NormalizedStripePaymentEvent = {
  kind: 'PAYMENT'
  eventId: string
  eventType: string
  stripeCreatedAt: Date
  command: PaymentCommand
  paymentAttemptId: string | null
  userId: string | null
  amountTotal: number | null
  currency: string | null
  stripeCheckoutSessionId: string | null
  stripePaymentIntentId: string | null
  stripeChargeId: string | null
  email: string | null
  shipping: ShippingSnapshot | null
}

export type IgnoredStripeEvent = {
  kind: 'IGNORED'
  eventId: string
  eventType: string
}

const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : (value?.id ?? null)

const toShippingSnapshot = (
  shipping: Stripe.Checkout.Session.CollectedInformation.ShippingDetails | null,
): ShippingSnapshot | null => {
  if (!shipping?.name || !shipping.address.line1 || !shipping.address.country) {
    return null
  }
  return {
    name: shipping.name,
    line1: shipping.address.line1,
    line2: shipping.address.line2,
    city: shipping.address.city,
    state: shipping.address.state,
    postalCode: shipping.address.postal_code,
    country: shipping.address.country,
  }
}

const common = (
  event: Stripe.Event,
  object: {
    metadata?: Stripe.Metadata | null
    payment_intent?: string | Stripe.PaymentIntent | null
  },
) => ({
  kind: 'PAYMENT' as const,
  eventId: event.id,
  eventType: event.type,
  stripeCreatedAt: new Date(event.created * 1000),
  paymentAttemptId: object.metadata?.paymentAttemptId ?? null,
  userId: object.metadata?.userId ?? null,
  stripePaymentIntentId: objectId(object.payment_intent),
  stripeCheckoutSessionId: null,
  stripeChargeId: null,
  amountTotal: null,
  currency: null,
  email: null,
  shipping: null,
})

export const normalizeStripeEvent = (
  event: Stripe.Event,
): NormalizedStripePaymentEvent | IgnoredStripeEvent => {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object
      const base = common(event, session)
      const command: PaymentCommand =
        event.type === 'checkout.session.completed'
          ? {
              type: 'CHECKOUT_COMPLETED',
              paid:
                session.payment_status === 'paid' ||
                session.payment_status === 'no_payment_required',
            }
          : event.type === 'checkout.session.async_payment_succeeded'
            ? { type: 'PAYMENT_SUCCEEDED' }
            : event.type === 'checkout.session.async_payment_failed'
              ? { type: 'PAYMENT_FAILED' }
              : { type: 'CHECKOUT_EXPIRED' }

      return {
        ...base,
        command,
        paymentAttemptId:
          session.metadata?.paymentAttemptId ?? base.paymentAttemptId,
        userId: session.metadata?.userId ?? session.client_reference_id ?? null,
        amountTotal: session.amount_total,
        currency: session.currency,
        stripeCheckoutSessionId: session.id,
        email: session.customer_details?.email ?? null,
        shipping: toShippingSnapshot(
          session.collected_information?.shipping_details ?? null,
        ),
      }
    }
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled': {
      const intent = event.data.object
      return {
        ...common(event, intent),
        command:
          event.type === 'payment_intent.succeeded'
            ? { type: 'PAYMENT_SUCCEEDED' }
            : event.type === 'payment_intent.payment_failed'
              ? { type: 'PAYMENT_FAILED' }
              : { type: 'PAYMENT_CANCELED' },
        stripePaymentIntentId: intent.id,
        amountTotal: intent.amount,
        currency: intent.currency,
      }
    }
    case 'charge.refunded': {
      const charge = event.data.object
      return {
        ...common(event, charge),
        command: {
          type: 'REFUND_UPDATED',
          amountRefunded: charge.amount_refunded,
        },
        stripeChargeId: charge.id,
        amountTotal: charge.amount,
        currency: charge.currency,
      }
    }
    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const dispute = event.data.object
      const chargeId = objectId(dispute.charge)
      if (
        event.type === 'charge.dispute.closed' &&
        dispute.status !== 'won' &&
        dispute.status !== 'lost'
      ) {
        break
      }
      return {
        ...common(event, dispute),
        command:
          event.type === 'charge.dispute.created'
            ? { type: 'DISPUTE_OPENED' }
            : {
                type: 'DISPUTE_CLOSED',
                outcome: dispute.status === 'won' ? 'WON' : 'LOST',
              },
        stripeChargeId: chargeId,
        amountTotal: dispute.amount,
        currency: dispute.currency,
      }
    }
  }

  return { kind: 'IGNORED', eventId: event.id, eventType: event.type }
}
