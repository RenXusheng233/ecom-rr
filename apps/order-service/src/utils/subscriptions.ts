import { topics } from '@repo/kafka'
import { consumer } from './kafka'
import {
  parsePaymentOrderEvent,
  persistPaymentInbox,
  persistRejectedPaymentEvent,
} from './paymentEvent'

export const runKafkaSubscriptions = async () => {
  await consumer.subscribe([
    {
      topicName: topics.payment_order_lifecycle,
      errorPolicy: 'retry',
      invalidMessageHandler: async (rawValue, metadata, error) => {
        await persistRejectedPaymentEvent(rawValue, metadata, error.message)
      },
      topicHandler: async (message, metadata) => {
        let event
        try {
          event = parsePaymentOrderEvent(message, metadata.key)
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : 'Invalid payment event'
          await persistRejectedPaymentEvent(
            JSON.stringify(message),
            metadata,
            reason,
          )
          return
        }
        await persistPaymentInbox(event)
      },
    },
  ])
}
