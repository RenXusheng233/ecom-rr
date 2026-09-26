import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchCheckoutClientSecret } from './checkoutSession'
import {
  CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY,
  CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
} from '../types'

const input = {
  token: 'test-token',
  paymentServiceUrl: 'http://payment.test',
  request: {
    cart: [
      {
        productId: '42',
        quantity: 1,
        selectedSize: '42',
        selectedColor: 'black',
      },
    ],
  },
}
const expired = () =>
  Response.json(
    { error: { code: 'CHECKOUT_SESSION_EXPIRED' } },
    { status: 409 },
  )
const success = () =>
  Response.json({ checkoutSessionClientSecret: 'fake-secret' })

function harness() {
  const entries = new Map<string, string>()
  const keys: string[] = []
  let serial = 0
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
  const responses: Array<() => Response | Promise<Response>> = []
  const dependencies = {
    storage,
    createKey: () => `key-${++serial}`,
    fetch: async (_url: string, options: RequestInit) => {
      keys.push(new Headers(options.headers).get('Idempotency-Key')!)
      const respond = responses.shift()
      assert.ok(respond, 'unexpected additional request')
      return respond()
    },
  }
  return { dependencies, entries, keys, responses }
}

test('renews the client key once after confirmed Session expiration', async () => {
  const state = harness()
  state.responses.push(expired, success)
  assert.equal(
    await fetchCheckoutClientSecret(input, state.dependencies),
    'fake-secret',
  )
  assert.deepEqual(state.keys, ['key-1', 'key-2'])
  assert.equal(state.entries.get(CHECKOUT_IDEMPOTENCY_STORAGE_KEY), 'key-2')
})

test('does not rotate the key after network failures or other server errors', async () => {
  for (const failure of [
    () => {
      throw new Error('network failure')
    },
    () =>
      Response.json(
        { error: { code: 'CHECKOUT_CREATION_RETRYABLE' } },
        { status: 503 },
      ),
    () =>
      Response.json(
        { error: { code: 'CATALOG_SYNC_PENDING' } },
        { status: 409 },
      ),
    () =>
      Response.json(
        { error: { code: 'CHECKOUT_SESSION_EXPIRED' } },
        { status: 500 },
      ),
    () => new Response('invalid JSON', { status: 502 }),
  ]) {
    const state = harness()
    state.responses.push(failure, success)
    await assert.rejects(fetchCheckoutClientSecret(input, state.dependencies))
    assert.equal(
      await fetchCheckoutClientSecret(input, state.dependencies),
      'fake-secret',
    )
    assert.deepEqual(state.keys, ['key-1', 'key-1'])
  }
})

test('bounds expiration recovery to one extra request', async () => {
  const state = harness()
  state.responses.push(expired, expired)
  await assert.rejects(
    fetchCheckoutClientSecret(input, state.dependencies),
    /CHECKOUT_SESSION_EXPIRED/,
  )
  assert.deepEqual(state.keys, ['key-1', 'key-2'])
})

test('concurrent expired responses share the same renewed key', async () => {
  const state = harness()
  const waiters: Array<(response: Response) => void> = []
  const deferred = () =>
    new Promise<Response>((resolve) => {
      waiters.push(resolve)
    })
  state.responses.push(deferred, deferred, success, success)
  const first = fetchCheckoutClientSecret(input, state.dependencies)
  const second = fetchCheckoutClientSecret(input, state.dependencies)
  assert.equal(waiters.length, 2)
  waiters[0]!(expired())
  waiters[1]!(expired())
  assert.deepEqual(await Promise.all([first, second]), [
    'fake-secret',
    'fake-secret',
  ])
  assert.deepEqual(state.keys, ['key-1', 'key-1', 'key-2', 'key-2'])
})

test('a late expired response cannot overwrite the key for a changed cart', async () => {
  const state = harness()
  let release!: (response: Response) => void
  state.responses.push(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve
      }),
    success,
  )
  const original = fetchCheckoutClientSecret(input, state.dependencies)
  const changedInput = {
    ...input,
    request: { cart: [{ ...input.request.cart[0]!, quantity: 2 }] },
  }
  await fetchCheckoutClientSecret(changedInput, state.dependencies)
  release(expired())
  await assert.rejects(original, /CHECKOUT_REQUEST_CHANGED/)
  assert.deepEqual(state.keys, ['key-1', 'key-2'])
  assert.equal(state.entries.get(CHECKOUT_IDEMPOTENCY_STORAGE_KEY), 'key-2')
  assert.equal(
    state.entries.get(CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY),
    JSON.stringify(changedInput.request),
  )
})

test('successful repeated requests retain the same key', async () => {
  const state = harness()
  state.responses.push(success, success)
  await fetchCheckoutClientSecret(input, state.dependencies)
  await fetchCheckoutClientSecret(input, state.dependencies)
  assert.deepEqual(state.keys, ['key-1', 'key-1'])
})

test('uses browser-style fetch without rebinding it to the dependency object', async () => {
  const state = harness()
  const fakeFetch = state.dependencies.fetch
  state.dependencies.fetch = async function (
    this: unknown,
    url: string,
    options: RequestInit,
  ) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError(
        "Failed to execute 'fetch' on 'Window': Illegal invocation",
      )
    }
    return fakeFetch(url, options)
  }
  state.responses.push(expired, success)

  assert.equal(
    await fetchCheckoutClientSecret(input, state.dependencies),
    'fake-secret',
  )
  assert.deepEqual(state.keys, ['key-1', 'key-2'])
})
