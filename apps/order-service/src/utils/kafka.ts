import { createConsumer, createKafkaClient, createProducer } from '@repo/kafka'

const SERVICE = 'order-service'
const GROUP_ID = 'order-group'

const kafkaClient = createKafkaClient(SERVICE)

export const producer = createProducer(kafkaClient)
export const consumer = createConsumer(kafkaClient, GROUP_ID)
