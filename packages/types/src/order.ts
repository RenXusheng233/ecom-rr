import type {
  DisputeStatus,
  OrderItemSnapshot,
  PaymentStatus,
  RefundStatus,
  ShippingSnapshot,
} from './payment-order'

export type OrderType = {
  _id: string
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
  createdAt: string
  updatedAt: string
}

export type OrderChartType = {
  month: string
  total: number
  successful: number
}
