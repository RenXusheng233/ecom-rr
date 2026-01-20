import { topics } from '@repo/kafka'
import { consumer } from './kafka'
import { createStripeProduct, deleteStripeProduct } from './stripeProduct'
import { StripeProductType } from '@repo/types'

export const runKafkaSubscriptions = async () => {
  consumer.subscribe([
    {
      topicName: topics.product_created,
      topicHandler: async (message) => {
        const product = (message as { value: StripeProductType }).value

        console.log(`Receive message: ${topics.product_created}`, product)

        await createStripeProduct(product)
      },
    },
    {
      topicName: topics.product_deleted,
      topicHandler: async (message) => {
        const productId = (message as { value: number }).value

        console.log(`Receive message: ${topics.product_deleted}`, productId)

        await deleteStripeProduct(productId)
      },
    },
  ])
}
