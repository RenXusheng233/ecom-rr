import { auth } from '@clerk/nextjs/server'
import PaymentSyncActions from './PaymentSyncActions'

type PaymentSummary = {
  webhooks?: Record<string, number>
  outbox?: Record<string, number>
  oldestPendingAt?: string | null
  successfulPaymentsAwaitingOrder?: number
}

type OrderSummary = {
  inbox?: Record<string, number>
  outbox?: Record<string, number>
  oldestPendingAt?: string | null
  rejectedEvents?: number
}

const getSummary = async <T,>(url: string, token: string | null) => {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

const total = (values?: Record<string, number>) =>
  Object.values(values ?? {}).reduce((sum, value) => sum + value, 0)

export default async function PaymentSyncPage() {
  const { getToken } = await auth()
  const token = await getToken()
  const [payment, order] = await Promise.all([
    getSummary<PaymentSummary>(
      `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/payment-order-sync/summary`,
      token,
    ),
    getSummary<OrderSummary>(
      `${process.env.NEXT_PUBLIC_ORDER_SERVICE_URL}/order-projection-sync/summary`,
      token,
    ),
  ])

  const cards = [
    {
      label: 'Webhook jobs',
      value: total(payment?.webhooks),
      detail: `${payment?.webhooks?.FAILED ?? 0} failed`,
    },
    {
      label: 'Payment Outbox',
      value: total(payment?.outbox),
      detail: `${payment?.outbox?.PENDING ?? 0} pending`,
    },
    {
      label: 'Order Inbox',
      value: total(order?.inbox),
      detail: `${order?.inbox?.FAILED ?? 0} failed`,
    },
    {
      label: 'Awaiting Order Ack',
      value: payment?.successfulPaymentsAwaitingOrder ?? 0,
      detail: `${order?.rejectedEvents ?? 0} rejected messages`,
    },
  ]

  return (
    <div className="space-y-6 pb-8">
      <div className="rounded-md bg-secondary px-4 py-3">
        <h1 className="font-semibold">Payment → Order Reliability</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Durable Inbox, Outbox, retries and projection acknowledgements.
        </p>
      </div>

      {!payment || !order ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm">
          One or more reliability summaries are currently unavailable.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg border p-4 shadow-sm">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold">{card.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Oldest Payment task</p>
          <p className="mt-2 text-muted-foreground">
            {payment?.oldestPendingAt
              ? new Date(payment.oldestPendingAt).toLocaleString()
              : 'No pending task'}
          </p>
        </div>
        <div className="rounded-lg border p-4 text-sm">
          <p className="font-medium">Oldest Order task</p>
          <p className="mt-2 text-muted-foreground">
            {order?.oldestPendingAt
              ? new Date(order.oldestPendingAt).toLocaleString()
              : 'No pending task'}
          </p>
        </div>
      </div>

      <PaymentSyncActions />
    </div>
  )
}
