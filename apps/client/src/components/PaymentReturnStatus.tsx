'use client'

import { useAuth } from '@clerk/nextjs'
import { ArrowRight, CheckCircle2, Clock3, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import useCartStore from '@/stores/cartStore'
import {
  CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY,
  CHECKOUT_IDEMPOTENCY_STORAGE_KEY,
} from '@/types'

type CheckoutStatus = {
  paymentAttemptId: string
  orderId: string
  paymentStatus:
    | 'CREATING'
    | 'OPEN'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELED'
    | 'EXPIRED'
  refundStatus: 'NONE' | 'PARTIAL' | 'FULL'
  disputeStatus: 'NONE' | 'OPEN' | 'WON' | 'LOST'
  orderStatus: 'NOT_CREATED' | 'PENDING' | 'CONFIRMED'
  amountTotal: number
  currency: 'usd'
}

const terminalFailures = new Set(['FAILED', 'CANCELED', 'EXPIRED'])

const clearCheckoutIdempotency = () => {
  sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY)
  sessionStorage.removeItem(CHECKOUT_IDEMPOTENCY_FINGERPRINT_STORAGE_KEY)
}

export default function PaymentReturnStatus({
  sessionId,
}: {
  sessionId: string
}) {
  const { getToken } = useAuth()
  const clearCart = useCartStore((state) => state.clearCart)
  const [status, setStatus] = useState<CheckoutStatus | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined

    const poll = async () => {
      try {
        const token = await getToken()
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/sessions/${encodeURIComponent(sessionId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (!response.ok) throw new Error('Status lookup failed')
        const next = (await response.json()) as CheckoutStatus
        if (!active) return
        setStatus(next)
        setError(false)

        if (next.orderStatus === 'CONFIRMED') {
          clearCart()
          clearCheckoutIdempotency()
          return
        }
        if (terminalFailures.has(next.paymentStatus)) return
      } catch {
        if (!active) return
        setError(true)
      }
      timer = setTimeout(() => void poll(), 2000)
    }

    void poll()
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [clearCart, getToken, sessionId])

  const confirmed = status?.orderStatus === 'CONFIRMED'
  const failed = status ? terminalFailures.has(status.paymentStatus) : false
  const title = confirmed
    ? 'Order confirmed'
    : failed
      ? 'Payment not completed'
      : status?.paymentStatus === 'SUCCEEDED'
        ? 'Payment received, creating your order'
        : 'Payment is processing'
  const Icon = confirmed ? CheckCircle2 : failed ? XCircle : Clock3

  return (
    <div className="flex justify-center py-12">
      <div className="w-full max-w-lg rounded-lg border border-gray-100 bg-white p-8 text-center shadow-lg">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
            confirmed
              ? 'bg-green-100 text-green-600'
              : failed
                ? 'bg-red-100 text-red-600'
                : 'bg-amber-100 text-amber-700'
          }`}
        >
          <Icon className="h-9 w-9" />
        </div>
        <h1 className="mt-5 text-2xl font-medium text-gray-800">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {error
            ? 'We could not refresh the status. Retrying automatically…'
            : confirmed
              ? 'Your payment and order are safely recorded.'
              : 'You can keep this page open while we confirm the result.'}
        </p>

        {status && (
          <div className="mt-8 grid gap-3 rounded-lg bg-gray-50 p-4 text-left text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Payment</span>
              <span className="font-medium text-gray-800">
                {status.paymentStatus}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-500">Order</span>
              <span className="font-medium text-gray-800">
                {status.orderStatus}
              </span>
            </div>
          </div>
        )}

        {confirmed && (
          <Link
            href="/orders"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 p-2.5 font-medium text-white shadow-lg transition-colors hover:bg-gray-900"
          >
            See your order
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {failed && (
          <Link
            href="/cart"
            onClick={clearCheckoutIdempotency}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 p-2.5 font-medium text-gray-800 transition-colors hover:bg-gray-50"
          >
            Return to cart
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </div>
  )
}
