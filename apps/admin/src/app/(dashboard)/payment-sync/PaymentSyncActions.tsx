'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function PaymentSyncActions() {
  const router = useRouter()
  const [orderId, setOrderId] = useState('')
  const [pending, setPending] = useState<'reconcile' | 'retry' | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const run = async (action: 'reconcile' | 'retry') => {
    setPending(action)
    setMessage(null)
    try {
      const response = await fetch('/api/payment-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, orderId: orderId.trim() || undefined }),
      })
      const result = (await response.json()) as {
        error?: string
        message?: string
      }
      if (!response.ok) throw new Error(result.error ?? 'Action failed')
      setMessage(result.message ?? 'Action completed')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-medium">Recovery actions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Reconciliation follows the same Inbox/Outbox path as live events.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => void run('reconcile')}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending === 'reconcile' ? 'Reconciling…' : 'Run reconciliation'}
        </button>
        <input
          value={orderId}
          onChange={(event) => setOrderId(event.target.value)}
          placeholder="Order ID"
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending !== null || !orderId.trim()}
          onClick={() => void run('retry')}
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending === 'retry' ? 'Queuing…' : 'Retry failed tasks'}
        </button>
      </div>
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </div>
  )
}
