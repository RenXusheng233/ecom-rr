import assert from 'node:assert/strict'
import test from 'node:test'
import type { ConsumerRunConfig, Kafka } from 'kafkajs'
import { createConsumer, type KafkaMessageMetadata } from './consumer'

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

test('passes Kafka coordinates and key to the handler', async () => {
  const harness = createHarness()
  let metadata: KafkaMessageMetadata | undefined

  await harness.consumer.subscribe([
    {
      topicName: 'payment.order.lifecycle',
      topicHandler: async (_value, context) => {
        metadata = context
      },
    },
  ])

  await harness.eachMessage()({
    topic: 'payment.order.lifecycle',
    partition: 2,
    message: {
      key: Buffer.from('order-1'),
      value: Buffer.from('{"id":"event-1"}'),
      timestamp: '0',
      attributes: 0,
      offset: '17',
      headers: {},
    },
    heartbeat: async () => undefined,
    pause: () => () => undefined,
  })

  assert.deepEqual(metadata, {
    topic: 'payment.order.lifecycle',
    partition: 2,
    offset: '17',
    key: 'order-1',
  })
})

test('routes invalid JSON to the topic invalid-message handler', async () => {
  const harness = createHarness()
  let rejected:
    | {
        rawValue: string
        metadata: KafkaMessageMetadata
        message: string
      }
    | undefined

  await harness.consumer.subscribe([
    {
      topicName: 'payment.order.lifecycle',
      topicHandler: async () => {
        assert.fail('The decoded handler must not receive invalid JSON')
      },
      invalidMessageHandler: async (rawValue, metadata, error) => {
        rejected = { rawValue, metadata, message: error.message }
      },
    },
  ])

  await harness.eachMessage()({
    topic: 'payment.order.lifecycle',
    partition: 3,
    message: {
      key: Buffer.from('order-2'),
      value: Buffer.from('{not-json'),
      timestamp: '0',
      attributes: 0,
      offset: '19',
      headers: {},
    },
    heartbeat: async () => undefined,
    pause: () => () => undefined,
  })

  assert.equal(rejected?.rawValue, '{not-json')
  assert.deepEqual(rejected?.metadata, {
    topic: 'payment.order.lifecycle',
    partition: 3,
    offset: '19',
    key: 'order-2',
  })
  assert.match(rejected?.message ?? '', /JSON/)
})

test('routes empty lifecycle values to the invalid-message handler', async () => {
  const harness = createHarness()
  let reason = ''
  await harness.consumer.subscribe([
    {
      topicName: 'payment.order.lifecycle',
      topicHandler: async () => assert.fail('must not handle an empty value'),
      invalidMessageHandler: async (_rawValue, _metadata, error) => {
        reason = error.message
      },
    },
  ])

  await harness.eachMessage()({
    topic: 'payment.order.lifecycle',
    partition: 0,
    message: {
      key: Buffer.from('order-1'),
      value: Buffer.alloc(0),
      timestamp: '0',
      attributes: 0,
      offset: '20',
      headers: {},
    },
    heartbeat: async () => undefined,
    pause: () => () => undefined,
  })

  assert.match(reason, /empty/)
})
