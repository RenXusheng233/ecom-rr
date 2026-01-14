import { createConsumer, createKafkaClient, createProducer } from '@repo/kafka'

const SERVICE = 'product-service'
const GROUP_ID = 'product-group'

const kafkaClient = createKafkaClient(SERVICE)

export const producer = createProducer(kafkaClient)
export const consumer = createConsumer(kafkaClient, GROUP_ID)
