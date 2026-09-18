import { randomUUID } from 'node:crypto'
import type {
  DisputeStatus,
  OrderItemSnapshot,
  PaymentOrderEvent,
  PaymentOrderEventType,
  PaymentStatus,
  RefundStatus,
  ShippingSnapshot,
} from '@repo/types'

export type PaymentLifecycleAttempt = {
  id: string
  orderId: string
  userId: string
  paymentStatus: PaymentStatus
  refundStatus: RefundStatus
  disputeStatus: DisputeStatus
  version: number
  currency: string
  amountTotal: number
  amountRefunded: number
  itemsSnapshot: Array<
    OrderItemSnapshot & { currency?: string; stripePriceId?: string }
  >
  stripeCheckoutSessionId: string | null
  stripePaymentIntentId: string | null
  email: string | null
  shippingSnapshot: ShippingSnapshot | null
}

const eventTypeFor = (
  attempt: PaymentLifecycleAttempt,
): PaymentOrderEventType => {
  if (attempt.disputeStatus === 'OPEN') return 'payment.dispute_opened'
  if (attempt.disputeStatus === 'WON') return 'payment.dispute_won'
  if (attempt.disputeStatus === 'LOST') return 'payment.dispute_lost'
  if (attempt.refundStatus === 'FULL') return 'payment.refunded'
  if (attempt.refundStatus === 'PARTIAL') {
    return 'payment.partially_refunded'
  }

  switch (attempt.paymentStatus) {
    case 'PROCESSING':
      return 'payment.processing'
    case 'SUCCEEDED':
      return 'payment.succeeded'
    case 'FAILED':
      return 'payment.failed'
    case 'CANCELED':
      return 'payment.canceled'
    case 'EXPIRED':
      return 'payment.expired'
    default:
      throw new Error(
        `Payment status ${attempt.paymentStatus} has no lifecycle event`,
      )
  }
}

export const createPaymentLifecycleEvent = (
  attempt: PaymentLifecycleAttempt,
  causationId: string,
  options: { eventId?: string; occurredAt?: string } = {},
): PaymentOrderEvent => {
  if (attempt.currency !== 'usd') {
    throw new Error(`Unsupported payment currency: ${attempt.currency}`)
  }
  if (!attempt.stripeCheckoutSessionId) {
    throw new Error('A payment lifecycle event requires a Checkout Session')
  }

  return {
    id: options.eventId ?? randomUUID(),
    type: eventTypeFor(attempt),
    schemaVersion: 1,
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    aggregateId: attempt.orderId,
    aggregateVersion: attempt.version,
    correlationId: attempt.id,
    causationId,
    data: {
      orderId: attempt.orderId,
      paymentAttemptId: attempt.id,
      userId: attempt.userId,
      paymentStatus: attempt.paymentStatus,
      refundStatus: attempt.refundStatus,
      disputeStatus: attempt.disputeStatus,
      amountTotal: attempt.amountTotal,
      amountRefunded: attempt.amountRefunded,
      currency: 'usd',
      stripeCheckoutSessionId: attempt.stripeCheckoutSessionId,
      stripePaymentIntentId: attempt.stripePaymentIntentId,
      email: attempt.email,
      shipping: attempt.shippingSnapshot,
      items: attempt.itemsSnapshot.map((item) => ({
        productId: item.productId,
        name: item.name,
        unitAmount: item.unitAmount,
        quantity: item.quantity,
        selectedSize: item.selectedSize,
        selectedColor: item.selectedColor,
      })),
    },
  }
}
