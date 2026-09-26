import assert from 'node:assert/strict'
import test from 'node:test'
import { toStripeShippingAddress } from './types'
import { shippingFormSchema } from './schemas'

test('keeps a complete recipient address and maps it to Stripe fields', () => {
  const form = shippingFormSchema.parse({
    name: 'Alex Chen',
    email: 'alex@example.com',
    phone: '13800138000',
    address: '1 Main St',
    city: 'Shanghai',
    postalCode: '200000',
    country: 'CN',
  })

  assert.equal(form.country, 'CN')
  assert.equal(form.postalCode, '200000')
  assert.deepEqual(toStripeShippingAddress(form), {
    name: 'Alex Chen',
    address: {
      line1: '1 Main St',
      city: 'Shanghai',
      postal_code: '200000',
      country: 'CN',
    },
  })
})

test('rejects a missing or malformed shipping country', () => {
  const base = {
    name: 'Alex Chen',
    email: 'alex@example.com',
    phone: '13800138000',
    address: '1 Main St',
    city: 'Shanghai',
    postalCode: '200000',
  }

  assert.equal(shippingFormSchema.safeParse(base).success, false)
  assert.equal(
    shippingFormSchema.safeParse({ ...base, country: 'China' }).success,
    false,
  )
})
