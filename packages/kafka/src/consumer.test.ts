import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConsumerRunConfig, Kafka } from 'kafkajs'
import { createConsumer } from './consumer'

const createHarness = () => {
  let runConfig: ConsumerRunConfig | undefined
  const kafka = {
    consumer: () => ({
      connect: async () => undefined,
      disconnect: async () => undefined,
      subscribe: async () => undefined,
      run: async (config: ConsumerRunConfig) => {
        runConfig = config
      },
    }),
  } as unknown as Kafka

  return {
    consumer: createConsumer(kafka, 'test-group'),
    eachMessage: () => {
      assert.ok(runConfig?.eachMessage)
      return runConfig.eachMessage
    },
  }
}

test('retry error policy rejects the Kafka handler', async () => {
  const harness = createHarness()
  await harness.consumer.subscribe([
    {
      topicName: 'catalog.product.sync.requested',
      errorPolicy: 'retry',
      topicHandler: async () => {
        throw new Error('database unavailable')
      },
    },
  ])

  await assert.rejects(
    harness.eachMessage()({
      topic: 'catalog.product.sync.requested',
      partition: 0,
      message: {
        key: null,
        value: Buffer.from('{"eventId":"event-1"}'),
        timestamp: '0',
        attributes: 0,
        offset: '1',
        headers: {},
      },
      heartbeat: async () => undefined,
      pause: () => () => undefined,
    }),
    /database unavailable/,
  )
})

test('legacy topics keep the log-and-skip behavior by default', async () => {
  const harness = createHarness()
  await harness.consumer.subscribe([
    {
      topicName: 'payment.successful',
      topicHandler: async () => {
        throw new Error('legacy failure')
      },
    },
  ])

  const originalLog = console.log
  console.log = () => undefined
  try {
    await assert.doesNotReject(
      harness.eachMessage()({
        topic: 'payment.successful',
        partition: 0,
        message: {
          key: null,
          value: Buffer.from('{"value":{}}'),
          timestamp: '0',
          attributes: 0,
          offset: '1',
          headers: {},
        },
        heartbeat: async () => undefined,
        pause: () => () => undefined,
      }),
    )
  } finally {
    console.log = originalLog
  }
})
