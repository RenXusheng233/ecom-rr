import { topics } from '@repo/kafka'
import { consumer } from './kafka'
import { createStripeProduct, deleteStripeProduct } from './stripeProduct'
import { StripeProductType } from '@repo/types'

export const runKafkaSubscriptions = async () => {
  consumer.subscribe([
    {
      topicName: topics.product_created,
      topicHandler: async (message) => {
        const product = message.value as StripeProductType

        console.log(`Receive message: ${topics.product_created}`, product)

        await createStripeProduct(product)
      },
    },
    {
      topicName: topics.product_deleted,
      topicHandler: async (message) => {
        const productId = message.value as number

        console.log(`Receive message: ${topics.product_deleted}`, productId)

        await deleteStripeProduct(productId)
      },
    },
  ])
}
