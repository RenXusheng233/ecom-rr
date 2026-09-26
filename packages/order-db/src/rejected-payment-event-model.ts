import mongoose from 'mongoose'
import type { InferSchemaType } from 'mongoose'

const { Schema } = mongoose

const RejectedPaymentEventSchema = new Schema(
  {
    kafkaCoordinate: { type: String, required: true },
    topic: { type: String, required: true },
    partition: { type: Number, required: true },
    offset: { type: String, required: true },
    messageKey: { type: String, default: null },
    rawValue: { type: String, required: true },
    reason: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
)

RejectedPaymentEventSchema.index({ kafkaCoordinate: 1 }, { unique: true })
RejectedPaymentEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type RejectedPaymentEventSchemaType = InferSchemaType<
  typeof RejectedPaymentEventSchema
>
export const RejectedPaymentEvent =
  mongoose.models.RejectedPaymentEvent ??
  mongoose.model<RejectedPaymentEventSchemaType>(
    'RejectedPaymentEvent',
    RejectedPaymentEventSchema,
  )
