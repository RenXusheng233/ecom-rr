import PaymentReturnStatus from '@/components/PaymentReturnStatus'

interface ReturnPageProps {
  searchParams: Promise<{ session_id?: string }>
}

export default async function ReturnPage({ searchParams }: ReturnPageProps) {
  const sessionId = (await searchParams).session_id?.trim()
  if (!sessionId) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-full max-w-lg rounded-lg border border-gray-100 bg-white p-8 text-center shadow-lg">
          <p className="text-sm text-gray-500">No payment session was found.</p>
        </div>
      </div>
    )
  }

  return <PaymentReturnStatus sessionId={sessionId} />
}
