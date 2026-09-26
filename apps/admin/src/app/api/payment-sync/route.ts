import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { userId, getToken } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = (await request.json()) as {
    action?: string
    orderId?: string
  }
  const token = await getToken()
  const headers = { Authorization: `Bearer ${token}` }

  if (body.action === 'reconcile') {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/payment-order-sync/reconcile`,
      { method: 'POST', headers },
    )
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Reconciliation failed' },
        { status: response.status },
      )
    }
    return NextResponse.json({ message: 'Reconciliation queued successfully' })
  }

  if (body.action === 'retry' && body.orderId?.trim()) {
    const orderId = encodeURIComponent(body.orderId.trim())
    const [payment, order] = await Promise.all([
      fetch(
        `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/payment-order-sync/${orderId}/retry`,
        { method: 'POST', headers },
      ),
      fetch(
        `${process.env.NEXT_PUBLIC_ORDER_SERVICE_URL}/order-projection-sync/${orderId}/retry`,
        { method: 'POST', headers },
      ),
    ])
    if (!payment.ok && !order.ok) {
      return NextResponse.json(
        { error: 'No failed task was found for this order' },
        { status: 404 },
      )
    }
    return NextResponse.json({ message: 'Failed tasks were queued for retry' })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
