import Link from 'next/link'

interface ReturnPageProps {
  searchParams: Promise<{ session_id: string }> | undefined
}

const ReturnPage = async ({ searchParams }: ReturnPageProps) => {
  const session_id = (await searchParams)?.session_id

  if (!session_id) {
    return <div>No session id found!</div>
  }

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_PAYMENT_SERVICE_URL}/sessions/${session_id}`,
  )
  const data = await res.json()

  return (
    <div>
      <h1>Payment: {data.status}</h1>
      <p>Payment Status: {data.paymentStatus}</p>
      <Link href="/orders">See your order</Link>
    </div>
  )
}

export default ReturnPage
