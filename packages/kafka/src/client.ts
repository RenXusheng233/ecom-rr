import { Kafka } from 'kafkajs'

export const createKafkaClient = (service: string) => {
  const kafka = new Kafka({
    clientId: service,
    brokers: ['localhost:9094', 'localhost:9095', 'localhost:9096'],
  })

  return kafka
}
