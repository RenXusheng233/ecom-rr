import { auth } from '@clerk/nextjs/server'
import { OrderType } from '@repo/types'

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

const OrdersPage = async () => {
  const orders = await fetchOrders()

  if (!orders || orders.length === 0) {
    return <div>No orders found!</div>
  }

  return (
    <div className="">
      <h1 className="text-2xl my-4 font-medium">Your Orders</h1>
      <ul>
        {orders.map(({ _id, amount, status, createdAt, products }) => (
          <li key={_id} className="flex items-center mb-4">
            <div className="w-1/4">
              <span className="font-medium text-sm text-gray-500">
                Order ID
              </span>
              <p>{_id}</p>
            </div>
            <div className="w-1/12">
              <span className="font-medium text-sm text-gray-500">Total</span>
              <p>{amount / 100}</p>
            </div>
            <div className="w-1/12">
              <span className="font-medium text-sm text-gray-500">Status</span>
              <p>{status}</p>
            </div>
            <div className="w-1/8">
              <span className="font-medium text-sm text-gray-500">Date</span>
              <p>
                {createdAt
                  ? new Date(createdAt).toLocaleDateString('en-US')
                  : '-'}
              </p>
            </div>
            <div>
              <span className="font-medium text-sm text-gray-500">
                Products
              </span>
              <p>{products?.map((product) => product.name).join(',') || '-'}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default OrdersPage
