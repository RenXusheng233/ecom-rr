import { z } from 'zod'

export const paymentStatuses = [
  'CREATING',
  'OPEN',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CANCELED',
  'EXPIRED',
] as const
export type PaymentStatus = (typeof paymentStatuses)[number]

export const refundStatuses = ['NONE', 'PARTIAL', 'FULL'] as const
export type RefundStatus = (typeof refundStatuses)[number]

export const disputeStatuses = ['NONE', 'OPEN', 'WON', 'LOST'] as const
export type DisputeStatus = (typeof disputeStatuses)[number]

export const paymentOrderEventTypes = [
  'payment.processing',
  'payment.succeeded',
  'payment.failed',
  'payment.canceled',
  'payment.expired',
  'payment.partially_refunded',
  'payment.refunded',
  'payment.dispute_opened',
  'payment.dispute_won',
  'payment.dispute_lost',
] as const
export type PaymentOrderEventType = (typeof paymentOrderEventTypes)[number]

export type EventEnvelope<TType extends string, TData> = {
  id: string
  type: TType
  schemaVersion: 1
  occurredAt: string
  aggregateId: string
  aggregateVersion: number
  correlationId: string
  causationId: string
  data: TData
}

export const checkoutItemInputSchema = z
  .object({
    productId: z.string().trim().min(1),
    quantity: z.number().int().safe().positive(),
    selectedSize: z.string().trim().min(1),
    selectedColor: z.string().trim().min(1),
  })
  .strict()

export const checkoutRequestSchema = z
  .object({
    cart: z.array(checkoutItemInputSchema).min(1),
  })
  .strict()

export type CheckoutItemInput = z.infer<typeof checkoutItemInputSchema>
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>

export const shippingSnapshotSchema = z
  .object({
    name: z.string().min(1),
    line1: z.string().min(1),
    line2: z.string().nullable(),
    city: z.string().nullable(),
    state: z.string().nullable(),
    postalCode: z.string().nullable(),
    country: z.string().min(1),
  })
  .strict()

export type ShippingSnapshot = z.infer<typeof shippingSnapshotSchema>

export const orderItemSnapshotSchema = z
  .object({
    productId: z.string().min(1),
    name: z.string().min(1),
    unitAmount: z.number().int().safe().nonnegative(),
    quantity: z.number().int().safe().positive(),
    selectedSize: z.string().min(1),
    selectedColor: z.string().min(1),
  })
  .strict()

export type OrderItemSnapshot = z.infer<typeof orderItemSnapshotSchema>

export const paymentOrderSnapshotSchema = z
  .object({
    orderId: z.string().min(1),
    paymentAttemptId: z.string().min(1),
    userId: z.string().min(1),
    paymentStatus: z.enum(paymentStatuses),
    refundStatus: z.enum(refundStatuses),
    disputeStatus: z.enum(disputeStatuses),
    amountTotal: z.number().int().safe().nonnegative(),
    amountRefunded: z.number().int().safe().nonnegative(),
    currency: z.literal('usd'),
    stripeCheckoutSessionId: z.string().min(1),
    stripePaymentIntentId: z.string().min(1).nullable(),
    email: z.string().email().nullable(),
    shipping: shippingSnapshotSchema.nullable(),
    items: z.array(orderItemSnapshotSchema).min(1),
  })
  .strict()
  .refine((snapshot) => snapshot.amountRefunded <= snapshot.amountTotal, {
    message: 'Refunded amount cannot exceed the payment total',
    path: ['amountRefunded'],
  })

export type PaymentOrderSnapshot = z.infer<typeof paymentOrderSnapshotSchema>

const eventEnvelopeFields = {
  id: z.string().min(1),
  schemaVersion: z.literal(1),
  occurredAt: z.string().datetime(),
  aggregateId: z.string().min(1),
  aggregateVersion: z.number().int().safe().positive(),
  correlationId: z.string().min(1),
  causationId: z.string().min(1),
}

export const paymentOrderEventSchema = z
  .object({
    ...eventEnvelopeFields,
    type: z.enum(paymentOrderEventTypes),
    data: paymentOrderSnapshotSchema,
  })
  .strict()
  .refine((event) => event.aggregateId === event.data.orderId, {
    message: 'Event aggregate must match the order snapshot',
    path: ['aggregateId'],
  })
  .refine((event) => event.correlationId === event.data.paymentAttemptId, {
    message: 'Event correlation must match the payment attempt',
    path: ['correlationId'],
  })

export type PaymentOrderEvent = z.infer<typeof paymentOrderEventSchema>

export const orderPaymentAppliedDataSchema = z
  .object({
    orderId: z.string().min(1),
    paymentAttemptId: z.string().min(1),
    appliedVersion: z.number().int().safe().positive(),
    orderExists: z.boolean(),
    appliedAt: z.string().datetime(),
  })
  .strict()

export type OrderPaymentAppliedData = z.infer<
  typeof orderPaymentAppliedDataSchema
>

export const orderPaymentAppliedEventSchema = z
  .object({
    ...eventEnvelopeFields,
    type: z.literal('order.payment.applied'),
    data: orderPaymentAppliedDataSchema,
  })
  .strict()
  .refine((event) => event.aggregateId === event.data.orderId, {
    message: 'Event aggregate must match the applied order',
    path: ['aggregateId'],
  })
  .refine((event) => event.aggregateVersion === event.data.appliedVersion, {
    message: 'Event version must match the applied order version',
    path: ['aggregateVersion'],
  })
  .refine((event) => event.correlationId === event.data.paymentAttemptId, {
    message: 'Event correlation must match the payment attempt',
    path: ['correlationId'],
  })

export type OrderPaymentAppliedEvent = z.infer<
  typeof orderPaymentAppliedEventSchema
>
