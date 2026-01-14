import { createConsumer, createKafkaClient, createProducer } from '@repo/kafka'

const SERVICE = 'payment-service'
const GROUP_ID = 'payment-group'

const kafkaClient = createKafkaClient(SERVICE)

export const producer = createProducer(kafkaClient)
export const consumer = createConsumer(kafkaClient, GROUP_ID)
