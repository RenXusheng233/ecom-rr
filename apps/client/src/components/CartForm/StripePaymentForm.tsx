'use client'

import { useAuth } from '@clerk/nextjs'
import { CheckoutProvider } from '@stripe/react-stripe-js/checkout'
import { loadStripe } from '@stripe/stripe-js'
import { useEffect, useState } from 'react'
import CheckoutForm from './CheckoutForm'
import { ShippingFormInputs } from '@/types'
import useCartStore from '@/stores/cartStore'
import { CartItemType } from '@repo/types'

const stripe = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
const clientSecret = async (token: string, cart: CartItemType[]) => {
  return fetch(
    `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/sessions/create-checkout-session`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      method: 'POST',
      body: JSON.stringify({
        cart,
      }),
    },
  )
    .then((response) => response.json())
    .then((json) => json.checkoutSessionClientSecret)
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

  if (!token) {
    return <div>Loading...(get token)</div>
  }

  return (
    <CheckoutProvider
      stripe={stripe}
      options={{ clientSecret: clientSecret(token, cart) }}
    >
      <CheckoutForm shippingForm={shippingForm} />
    </CheckoutProvider>
  )
}

export default StripePaymentForm
