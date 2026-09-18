'use client'

import { useAuth } from '@clerk/nextjs'
import { CheckoutProvider } from '@stripe/react-stripe-js/checkout'
import { loadStripe } from '@stripe/stripe-js'
import { useEffect, useMemo, useState } from 'react'
import CheckoutForm from './CheckoutForm'
import {
  CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY,
  CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
  type ShippingFormInputs,
  toCheckoutRequest,
} from '@/types'
import useCartStore from '@/stores/cartStore'
import { CartItemType } from '@repo/types'

const stripe = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
const getOrCreateIdempotencyKey = (requestFingerprint: string) => {
  const existing = sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY)
  const existingFingerprint = sessionStorage.getItem(
    CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY,
  )
  if (existing && existingFingerprint === requestFingerprint) return existing
  const created = crypto.randomUUID()
  sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY, created)
  sessionStorage.setItem(
    CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY,
    requestFingerprint,
  )
  return created
}

const fetchClientSecret = async (token: string, cart: CartItemType[]) => {
  const request = toCheckoutRequest(cart)
  const requestFingerprint = JSON.stringify(request)
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/sessions/create-checkout-session`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': getOrCreateIdempotencyKey(requestFingerprint),
      },
      method: 'POST',
      body: requestFingerprint,
    },
  )
  const body = (await response.json()) as {
    checkoutSessionClientSecret?: string
    error?: { code?: string }
  }
  if (!response.ok || !body.checkoutSessionClientSecret) {
    throw new Error(body.error?.code ?? 'CHECKOUT_SESSION_FAILED')
  }
  return body.checkoutSessionClientSecret
}

interface StripePaymentFormProps {
  shippingForm: ShippingFormInputs
}

const StripePaymentForm = ({ shippingForm }: StripePaymentFormProps) => {
  const { getToken } = useAuth()
  const { cart } = useCartStore()
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    getToken().then((token) => {
      setToken(token)
    })
  }, [getToken])

  const options = useMemo(
    () => (token ? { clientSecret: fetchClientSecret(token, cart) } : null),
    [cart, token],
  )

  if (!options) {
    return <div>Loading...(get token)</div>
  }

  return (
    <CheckoutProvider stripe={stripe} options={options}>
      <CheckoutForm shippingForm={shippingForm} />
    </CheckoutProvider>
  )
}

export default StripePaymentForm
