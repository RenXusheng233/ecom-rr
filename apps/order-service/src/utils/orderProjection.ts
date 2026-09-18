import type {
  DisputeStatus,
  OrderItemSnapshot,
  PaymentOrderEvent,
  PaymentStatus,
  RefundStatus,
  ShippingSnapshot,
} from '@repo/types'

export type OrderProjection = {
  orderId: string
  paymentAttemptId: string
  stripeCheckoutSessionId: string
  stripePaymentIntentId: string | null
  paymentVersion: number
  paymentStatus: PaymentStatus
  refundStatus: RefundStatus
  disputeStatus: DisputeStatus
  userId: string
  email: string | null
  amountTotal: number
  amountRefunded: number
  currency: 'usd'
  products: OrderItemSnapshot[]
  shipping: ShippingSnapshot | null
}

export const decideOrderProjection = (
  current: OrderProjection | null,
  event: PaymentOrderEvent,
): { apply: boolean; next: OrderProjection | null } => {
  if (current && event.aggregateVersion <= current.paymentVersion) {
    return { apply: false, next: current }
  }
  if (!current && event.data.paymentStatus !== 'SUCCEEDED') {
    return { apply: false, next: null }
  }

  return {
    apply: true,
    next: {
      orderId: event.data.orderId,
      paymentAttemptId: event.data.paymentAttemptId,
      stripeCheckoutSessionId: event.data.stripeCheckoutSessionId,
      stripePaymentIntentId: event.data.stripePaymentIntentId,
      paymentVersion: event.aggregateVersion,
      paymentStatus: event.data.paymentStatus,
      refundStatus: event.data.refundStatus,
      disputeStatus: event.data.disputeStatus,
      userId: event.data.userId,
      email: event.data.email,
      amountTotal: event.data.amountTotal,
      amountRefunded: event.data.amountRefunded,
      currency: event.data.currency,
      products: event.data.items,
      shipping: event.data.shipping,
    },
  }
}
