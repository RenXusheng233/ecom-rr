import { auth } from '@clerk/nextjs/server'
import { OrderType } from '@repo/types'
import { ArrowRight, CalendarDays, Package2, ShoppingBag } from 'lucide-react'
import Link from 'next/link'

const fetchOrders = async () => {
  const { getToken } = await auth()
  const token = await getToken()

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_ORDER_SERVICE_URL}/user-orders`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )

  const orders: OrderType[] = await res.json()
  return orders
}

const formatCurrency = (amount: number) => `$${(amount / 100).toFixed(2)}`

const formatStatus = (status: string) =>
  status.charAt(0).toUpperCase() + status.slice(1)

const getStatusClassName = (status: string) =>
  status === 'success'
    ? 'bg-green-100 text-green-700'
    : 'bg-red-100 text-red-600'

const OrdersPage = async () => {
  const orders = await fetchOrders()

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <ShoppingBag className="h-8 w-8" />
        </div>
        <h1 className="mt-5 text-2xl font-medium text-gray-800">
          No orders yet
        </h1>
        <p className="mt-2 max-w-sm text-sm text-gray-500">
          Your completed purchases will appear here once you place an order.
        </p>
        <Link
          href="/"
          className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2.5
                     text-sm font-medium text-white shadow-lg transition-all duration-300 hover:bg-gray-900
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-800
                     focus-visible:ring-offset-2"
        >
          Start shopping
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="py-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-400">
            Account
          </p>
          <h1 className="mt-2 text-2xl font-medium text-gray-800">
            Your Orders
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Review your recent purchases and order details.
          </p>
        </div>
        <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-600">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </span>
      </div>

      <ul className="flex flex-col gap-6">
        {orders.map(({ _id, amount, status, createdAt, products }) => (
          <li
            key={_id}
            className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg"
          >
            <div className="flex flex-col gap-4 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                  <Package2 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Order ID
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-gray-800">
                    #{_id}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 sm:justify-end">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <CalendarDays className="h-4 w-4" />
                  <span>
                    {createdAt
                      ? new Date(createdAt).toLocaleDateString('en-US')
                      : '-'}
                  </span>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClassName(status)}`}
                >
                  {formatStatus(status)}
                </span>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                <ShoppingBag className="h-4 w-4" />
                Products
              </div>
              <div className="divide-y divide-gray-100">
                {products?.map((product, index) => (
                  <div
                    key={`${product.name}-${index}`}
                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {product.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Quantity: {product.quantity}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium text-gray-800">
                      {formatCurrency(product.price * product.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between bg-gray-50 px-5 py-4">
              <span className="text-sm font-medium text-gray-500">Total</span>
              <span className="text-lg font-semibold text-gray-800">
                {formatCurrency(amount)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default OrdersPage
