import { topics } from '@repo/kafka'
import { consumer } from './kafka'
import { OrderType } from '@repo/types'
import { createOrder } from './order'

export const runKafkaSubscriptions = async () => {
  consumer.subscribe([
    {
      topicName: topics.payment_successful,
      topicHandler: async (message) => {
        console.log(`Receive message: ${topics.payment_successful}`, message)

        const order = message.value as OrderType
        await createOrder(order)
      },
    },
  ])
}
