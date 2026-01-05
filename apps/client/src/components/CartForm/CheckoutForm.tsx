'use client'

import { ShippingFormInputs } from '@/types'
import { useCheckout, PaymentElement } from '@stripe/react-stripe-js/checkout'
import { ConfirmError } from '@stripe/stripe-js'
import { useState } from 'react'

interface CheckoutFormProps {
  shippingForm: ShippingFormInputs
}

const CheckoutForm = ({ shippingForm }: CheckoutFormProps) => {
  const { email, address, city } = shippingForm
  const checkoutState = useCheckout()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ConfirmError | null>(null)

  if (checkoutState.type === 'loading') {
    return <div>Loading...</div>
  } else if (checkoutState.type === 'error') {
    return <div>Error: {checkoutState.error.message}</div>
  }

  const handleClick = async () => {
    setLoading(true)
    await checkoutState.checkout.updateEmail(email)
    await checkoutState.checkout.updateShippingAddress({
      name: 'shipping_address',
      address: {
        line1: address,
        line2: city,
        country: 'US',
      },
    })

    const res = await checkoutState.checkout.confirm()
    if (res.type === 'error') {
      setError(res.error)
    }
    setLoading(false)
  }

  return (
    <form>
      <PaymentElement options={{ layout: 'accordion' }} />
      <button disabled={loading} onClick={handleClick}>
        {loading ? 'loading...' : 'Pay'}
      </button>
      {error && <div>{error.message}</div>}
    </form>
  )
}

export default CheckoutForm
