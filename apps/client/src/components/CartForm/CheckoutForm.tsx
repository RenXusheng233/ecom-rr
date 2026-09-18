'use client'

import { ShippingFormInputs } from '@/types'
import { useCheckout, PaymentElement } from '@stripe/react-stripe-js/checkout'
import { ConfirmError } from '@stripe/stripe-js'
import { CreditCard } from 'lucide-react'
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
    <form className="flex flex-col gap-6">
      <PaymentElement options={{ layout: 'accordion' }} />
      <button
        type="button"
        disabled={loading}
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 p-2.5
                   font-medium text-white shadow-lg transition-all duration-300 hover:bg-gray-900
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-800
                   focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CreditCard className="h-4 w-4" />
        {loading ? 'Processing...' : 'Pay'}
      </button>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error.message}
        </div>
      )}
    </form>
  )
}

export default CheckoutForm
