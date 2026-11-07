import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import {
  archiveTaskIdentitySchema,
  type CustomJwtSessionClaims,
} from '@repo/types'
import { loadDeletionStatuses } from '@/lib/product-deletions'

async function adminToken() {
  const { userId, sessionClaims, getToken } = await auth()
  if (!userId)
    return NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  if ((sessionClaims as CustomJwtSessionClaims)?.metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const token = await getToken()
  return (
    token ??
    NextResponse.json({ error: 'Please sign in again' }, { status: 401 })
  )
}

export async function GET(request: Request) {
  const token = await adminToken()
  if (token instanceof Response) return token
  const cursor = new URL(request.url).searchParams.get('cursor') ?? undefined
  try {
    const page = await loadDeletionStatuses({
      token,
      cursor,
      productServiceUrl: process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL!,
      paymentServiceUrl: process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL!,
    })
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json(
      { error: 'Deletion tasks could not be loaded. Please try again.' },
      { status: 502 },
    )
  }
}

export async function POST(request: Request) {
  const token = await adminToken()
  if (token instanceof Response) return token
  const parsed = archiveTaskIdentitySchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid archive task' }, { status: 400 })
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/catalog-sync/${parsed.data.productId}/archive-retry`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: parsed.data.taskId,
          catalogVersion: parsed.data.catalogVersion,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!response.ok)
      return NextResponse.json(
        {
          error:
            response.status === 409
              ? 'The archive task changed or is no longer failed. Refresh its status.'
              : 'The archive could not be retried. Please try again.',
        },
        { status: response.status === 409 ? 409 : 502 },
      )
    return NextResponse.json({ queued: true })
  } catch {
    return NextResponse.json(
      { error: 'The archive could not be retried. Please try again.' },
      { status: 502 },
    )
  }
}
