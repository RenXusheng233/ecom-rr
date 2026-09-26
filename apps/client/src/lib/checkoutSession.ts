import type { CheckoutRequest } from '@repo/types'
import {
  CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY,
  CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
} from '../types'

type CheckoutClientDependencies = {
  storage: Pick<Storage, 'getItem' | 'setItem'>
  createKey: () => string
  fetch: (url: string, options: RequestInit) => Promise<Response>
}

export const fetchCheckoutClientSecret = async (
  input: { token: string; request: CheckoutRequest; paymentServiceUrl: string },
  dependencies: CheckoutClientDependencies,
) => {
  const { storage, createKey, fetch: requestFetch } = dependencies
  const fingerprint = JSON.stringify(input.request)
  const existing = storage.getItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY)
  const existingFingerprint = storage.getItem(
    CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY,
  )
  let key =
    existing && existingFingerprint === fingerprint ? existing : createKey()
  storage.setItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY, key)
  storage.setItem(CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY, fingerprint)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await requestFetch(
      `${input.paymentServiceUrl}/sessions/create-checkout-session`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.token}`,
          'Idempotency-Key': key,
        },
        body: fingerprint,
      },
    )
    const body = (await response.json()) as {
      checkoutSessionClientSecret?: string
      error?: { code?: string }
    } | null
    if (
      attempt === 0 &&
      response.status === 409 &&
      body?.error?.code === 'CHECKOUT_SESSION_EXPIRED'
    ) {
      const currentKey = storage.getItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY)
      if (
        !currentKey ||
        storage.getItem(CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY) !==
          fingerprint
      ) {
        throw new Error('CHECKOUT_REQUEST_CHANGED')
      }
      // Concurrent expired responses must reuse the first replacement key.
      key = currentKey === key ? createKey() : currentKey
      storage.setItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY, key)
      continue
    }
    if (
      !response.ok ||
      typeof body?.checkoutSessionClientSecret !== 'string' ||
      !body.checkoutSessionClientSecret
    ) {
      throw new Error(body?.error?.code ?? 'CHECKOUT_SESSION_FAILED')
    }
    return body.checkoutSessionClientSecret
  }
  throw new Error('CHECKOUT_SESSION_FAILED')
}
