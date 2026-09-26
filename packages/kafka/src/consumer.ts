import { Consumer, Kafka } from 'kafkajs'

export type KafkaMessageMetadata = {
  topic: string
  partition: number
  offset: string
  key: string | null
}

type TopicSubscription = {
  topicName: string
  topicHandler: (
    message: unknown,
    metadata: KafkaMessageMetadata,
  ) => Promise<void>
  invalidMessageHandler?: (
    rawValue: string,
    metadata: KafkaMessageMetadata,
    error: Error,
  ) => Promise<void>
  errorPolicy?: 'retry' | 'skip'
}

export const createConsumer = (kafka: Kafka, groupId: string) => {
  const consumer: Consumer = kafka.consumer({ groupId })

  const connect = async () => {
    await consumer.connect()

    console.log('Kafka consumer connected: ' + groupId)
  }

  const subscribe = async (topics: TopicSubscription[]) => {
    await consumer.subscribe({
      topics: topics.map((topic) => topic.topicName),
      fromBeginning: true,
    })

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const topicConfig = topics.find(
          (candidate) => candidate.topicName === topic,
        )
        try {
          if (topicConfig) {
            const value = message.value?.toString() ?? ''
            const metadata: KafkaMessageMetadata = {
              topic,
              partition,
              offset: message.offset,
              key: message.key?.toString() ?? null,
            }
            if (!value) {
              const error = new Error('Kafka message value is empty')
              if (!topicConfig.invalidMessageHandler) throw error
              await topicConfig.invalidMessageHandler(value, metadata, error)
              return
            }
            {
              let parsed: unknown
              try {
                parsed = JSON.parse(value) as unknown
              } catch (error) {
                if (!topicConfig.invalidMessageHandler) throw error
                await topicConfig.invalidMessageHandler(
                  value,
                  metadata,
                  error instanceof Error ? error : new Error(String(error)),
                )
                return
              }
              await topicConfig.topicHandler(parsed, metadata)
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
