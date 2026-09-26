import mongoose from 'mongoose'
import type { InferSchemaType } from 'mongoose'

const { Schema } = mongoose

export const PaymentStatuses = [
  'CREATING',
  'OPEN',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'EXPIRED',
] as const
export const RefundStatuses = ['NONE', 'PARTIAL', 'FULL'] as const
export const DisputeStatuses = ['NONE', 'OPEN', 'WON', 'LOST'] as const

const OrderItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    unitAmount: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    selectedSize: { type: String, required: true },
    selectedColor: { type: String, required: true },
  },
  { _id: false },
)

const ShippingSchema = new Schema(
  {
    name: { type: String, required: true },
    line1: { type: String, required: true },
    line2: { type: String, default: null },
    city: { type: String, default: null },
    state: { type: String, default: null },
    postalCode: { type: String, default: null },
    country: { type: String, required: true },
    phone: { type: String, default: null },
  },
  { _id: false },
)

const OrderSchema = new Schema(
  {
    orderId: { type: String, required: true },
    paymentAttemptId: { type: String, required: true },
    stripeCheckoutSessionId: { type: String, required: true },
    stripePaymentIntentId: { type: String, default: null },
    paymentVersion: { type: Number, required: true, min: 1 },
    paymentStatus: {
      type: String,
      required: true,
      enum: PaymentStatuses,
    },
    refundStatus: {
      type: String,
      required: true,
      enum: RefundStatuses,
    },
    disputeStatus: {
      type: String,
      required: true,
      enum: DisputeStatuses,
    },
    userId: { type: String, required: true },
    email: { type: String, default: null },
    amountTotal: { type: Number, required: true, min: 0 },
    amountRefunded: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: ['usd'] },
    products: { type: [OrderItemSchema], required: true },
    shipping: { type: ShippingSchema, default: null },
  },
  { timestamps: true },
)

OrderSchema.index({ orderId: 1 }, { unique: true })
OrderSchema.index({ paymentAttemptId: 1 }, { unique: true })
OrderSchema.index({ stripeCheckoutSessionId: 1 }, { unique: true })
OrderSchema.index(
  { stripePaymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { stripePaymentIntentId: { $type: 'string' } },
  },
)
OrderSchema.index({ userId: 1, createdAt: -1 })

export type OrderSchemaType = InferSchemaType<typeof OrderSchema>
export const Order =
  mongoose.models.Order ?? mongoose.model<OrderSchemaType>('Order', OrderSchema)
