import mongoose from 'mongoose'
import type { InferSchemaType } from 'mongoose'

const { Schema } = mongoose

export const OrderOutboxStatuses = ['PENDING', 'PUBLISHED'] as const

const OrderOutboxEventSchema = new Schema(
  {
    eventId: { type: String, required: true },
    orderId: { type: String, required: true },
    aggregateVersion: { type: Number, required: true, min: 1 },
    topic: { type: String, required: true },
    messageKey: { type: String, required: true },
    eventType: { type: String, required: true },
    schemaVersion: { type: Number, required: true, default: 1 },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: OrderOutboxStatuses,
      default: 'PENDING',
    },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: Date.now },
    leaseUntil: { type: Date, default: null },
    claimToken: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
)

OrderOutboxEventSchema.index({ eventId: 1 }, { unique: true })
OrderOutboxEventSchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 })
OrderOutboxEventSchema.index({ orderId: 1, aggregateVersion: 1 })

export type OrderOutboxEventSchemaType = InferSchemaType<
  typeof OrderOutboxEventSchema
>
export const OrderOutboxEvent =
  mongoose.models.OrderOutboxEvent ??
  mongoose.model<OrderOutboxEventSchemaType>(
    'OrderOutboxEvent',
    OrderOutboxEventSchema,
  )
