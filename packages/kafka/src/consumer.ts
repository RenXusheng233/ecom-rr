import { Consumer, Kafka } from 'kafkajs'

export const createConsumer = (kafka: Kafka, groupId: string) => {
  const consumer: Consumer = kafka.consumer({ groupId })

  const connect = async () => {
    await consumer.connect()

    console.log('Kafka consumer connected: ' + groupId)
  }

  const subscribe = async (
    topics: {
      topicName: string
      topicHandler: (message: unknown) => Promise<void>
      errorPolicy?: 'retry' | 'skip'
    }[],
  ) => {
    await consumer.subscribe({
      topics: topics.map((topic) => topic.topicName),
      fromBeginning: true,
    })

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const topicConfig = topics.find(
          (candidate) => candidate.topicName === topic,
        )
        try {
          if (topicConfig) {
            const value = message.value?.toString()

            if (value) {
              await topicConfig.topicHandler(JSON.parse(value) as unknown)
            }
          }
        } catch (error) {
          if (topicConfig?.errorPolicy === 'retry') {
            throw error
          }
          console.log('Error processing message: ', error)
        }
      },
    })
  }

  const disconnect = async () => {
    await consumer.disconnect()
  }

  return { connect, subscribe, disconnect }
}
