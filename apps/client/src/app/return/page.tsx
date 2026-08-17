import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

interface ReturnPageProps {
  searchParams: Promise<{ session_id: string }> | undefined
}

const ReturnPage = async ({ searchParams }: ReturnPageProps) => {
  const session_id = (await searchParams)?.session_id

  if (!session_id) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-full max-w-lg rounded-lg border border-gray-100 bg-white p-8 text-center shadow-lg">
          <p className="text-sm text-gray-500">No session ID found.</p>
        </div>
      </div>
    )
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/sessions/${session_id}`,
  )
  const data = await res.json()

  return (
    <div className="flex justify-center py-12">
      <div className="w-full max-w-lg rounded-lg border border-gray-100 bg-white p-8 shadow-lg">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
            Payment complete
          </p>
          <h1 className="mt-2 text-2xl font-medium text-gray-800">
            Thank you for your order
          </h1>
        </div>

        <div className="mt-8 flex flex-col gap-4 rounded-lg bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Payment</span>
            <span className="font-medium capitalize text-gray-800">
              {data.status}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Payment Status</span>
            <span className="font-medium capitalize text-green-600">
              {data.paymentStatus}
            </span>
          </div>
        </div>

        <Link
          href="/orders"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-800 p-2.5
                     font-medium text-white shadow-lg transition-all duration-300 hover:bg-gray-900
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-800
                     focus-visible:ring-offset-2"
        >
          See your order
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

export default ReturnPage
