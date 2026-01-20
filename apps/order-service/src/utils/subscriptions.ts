import { topics } from '@repo/kafka'
import { consumer } from './kafka'

export const runKafkaSubscriptions = async () => {
  consumer.subscribe([
    {
      topicName: topics.payment_successful,
      topicHandler: async (message) => {
        console.log(`Receive message: ${topics.payment_successful}`, message)
      },
    },
  ])
}
