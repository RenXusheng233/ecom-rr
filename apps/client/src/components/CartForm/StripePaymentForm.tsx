'use client'

import { useAuth } from '@clerk/nextjs'
import { CheckoutProvider } from '@stripe/react-stripe-js/checkout'
import { loadStripe } from '@stripe/stripe-js'
import { useEffect, useMemo, useState } from 'react'
import CheckoutForm from './CheckoutForm'
import { type ShippingFormInputs, toCheckoutRequest } from '@/types'
import { fetchCheckoutClientSecret } from '@/lib/checkoutSession'
import useCartStore from '@/stores/cartStore'
import { CartItemType } from '@repo/types'

const stripe = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
const fetchClientSecret = async (token: string, cart: CartItemType[]) =>
  fetchCheckoutClientSecret(
    {
      token,
      request: toCheckoutRequest(cart),
      paymentServiceUrl: process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL!,
    },
    {
      storage: sessionStorage,
      createKey: () => crypto.randomUUID(),
      fetch,
    },
  )

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
