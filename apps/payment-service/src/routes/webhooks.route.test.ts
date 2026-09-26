import assert from 'node:assert/strict'
import test from 'node:test'
import type Stripe from 'stripe'
import { createWebhookRoute } from './webhooks.route'

const event = {
  id: 'evt_1',
  type: 'checkout.session.completed',
  created: 1789689600,
  data: { object: { id: 'cs_1' } },
} as unknown as Stripe.Event

test('returns success only after the verified Stripe event is durable', async () => {
  const persisted: string[] = []
  const route = createWebhookRoute({
    verifyEvent: () => event,
    persistEvent: async (value) => {
      persisted.push(value.id)
    },
  })

  const response = await route.request('/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'signature' },
    body: '{}',
  })

  assert.equal(response.status, 200)
  assert.deepEqual(persisted, ['evt_1'])
})

test('returns 400 when Stripe signature verification fails', async () => {
  const route = createWebhookRoute({
    verifyEvent: () => {
      throw new Error('bad signature')
    },
    persistEvent: async () => assert.fail('must not persist'),
  })

  const response = await route.request('/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'invalid' },
    body: '{}',
  })

  assert.equal(response.status, 400)
})

test('returns 500 so Stripe retries when Inbox persistence fails', async () => {
  const route = createWebhookRoute({
    verifyEvent: () => event,
    persistEvent: async () => {
      throw new Error('database unavailable')
    },
  })

  const response = await route.request('/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 'signature' },
    body: '{}',
  })

  assert.equal(response.status, 500)
})
