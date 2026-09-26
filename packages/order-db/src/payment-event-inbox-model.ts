import mongoose from 'mongoose'
import type { InferSchemaType } from 'mongoose'

const { Schema } = mongoose

export const PaymentInboxStatuses = [
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
] as const

const PaymentEventInboxSchema = new Schema(
  {
    eventId: { type: String, required: true },
    orderId: { type: String, required: true },
    aggregateVersion: { type: Number, required: true, min: 1 },
    eventType: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: PaymentInboxStatuses,
      default: 'PENDING',
    },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    leaseUntil: { type: Date, default: null },
    claimToken: { type: String, default: null },
    lastError: { type: String, default: null },
    receivedAt: { type: Date, required: true, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

PaymentEventInboxSchema.index({ eventId: 1 }, { unique: true })
PaymentEventInboxSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 })
PaymentEventInboxSchema.index({ orderId: 1, aggregateVersion: 1 })

export type PaymentEventInboxSchemaType = InferSchemaType<
  typeof PaymentEventInboxSchema
>
export const PaymentEventInbox =
  mongoose.models.PaymentEventInbox ??
  mongoose.model<PaymentEventInboxSchemaType>(
    'PaymentEventInbox',
    PaymentEventInboxSchema,
  )
