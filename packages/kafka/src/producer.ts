import { Kafka, Partitioners, Producer } from 'kafkajs'

type SendOptions = {
  key?: string
  headers?: Record<string, string>
}

export const createProducer = (kafka: Kafka) => {
  const producer: Producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
  })

  const connect = async () => {
    await producer.connect()
  }

  const send = async (
    topic: string,
    message: object,
    options: SendOptions = {},
  ) => {
    await producer.send({
      topic,
      messages: [
        {
          key: options.key,
          value: JSON.stringify(message),
          headers: options.headers,
        },
      ],
    })
  }

  const disconnect = async () => {
    await producer.disconnect()
  }

  return { connect, send, disconnect }
}
