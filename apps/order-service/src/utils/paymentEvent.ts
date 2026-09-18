import type { KafkaMessageMetadata } from '@repo/kafka'
import { PaymentEventInbox, RejectedPaymentEvent } from '@repo/order-db'
import { paymentOrderEventSchema, type PaymentOrderEvent } from '@repo/types'

export type PaymentInboxRepository = {
  insert(event: PaymentOrderEvent): Promise<void>
}

type RejectedEventRepository = {
  insert(input: {
    kafkaCoordinate: string
    topic: string
    partition: number
    offset: string
    messageKey: string | null
    rawValue: string
    reason: string
    expiresAt: Date
  }): Promise<void>
}

const isDuplicateKey = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error.code === 11000 || error.code === '11000')

export const parsePaymentOrderEvent = (
  value: unknown,
  messageKey: string | null,
): PaymentOrderEvent => {
  const event = paymentOrderEventSchema.parse(value)
  if (messageKey !== event.aggregateId) {
    throw new Error('Kafka message key must match the Order aggregate ID')
  }
  return event
}

const mongoPaymentInboxRepository: PaymentInboxRepository = {
  insert: async (event) => {
    await PaymentEventInbox.create({
      eventId: event.id,
      orderId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      eventType: event.type,
      payload: event,
    })
  },
}

export const persistPaymentInbox = async (
  event: PaymentOrderEvent,
  repository: PaymentInboxRepository = mongoPaymentInboxRepository,
) => {
  try {
    await repository.insert(event)
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
  }
}

const mongoRejectedEventRepository: RejectedEventRepository = {
  insert: async (input) => {
    await RejectedPaymentEvent.updateOne(
      { kafkaCoordinate: input.kafkaCoordinate },
      { $setOnInsert: input },
      { upsert: true },
    )
  },
}

export const persistRejectedPaymentEvent = async (
  rawValue: string,
  metadata: KafkaMessageMetadata,
  reason: string,
  repository: RejectedEventRepository = mongoRejectedEventRepository,
) => {
  await repository.insert({
    kafkaCoordinate: `${metadata.topic}:${metadata.partition}:${metadata.offset}`,
    topic: metadata.topic,
    partition: metadata.partition,
    offset: metadata.offset,
    messageKey: metadata.key,
    rawValue: rawValue.slice(0, 64 * 1024),
    reason: reason.slice(0, 1000),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  })
}
