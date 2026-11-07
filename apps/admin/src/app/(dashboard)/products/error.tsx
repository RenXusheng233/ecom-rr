'use client'

import { Button } from '@/components/ui/button'

export default function ProductsError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 rounded-md border p-4" role="alert">
      <p>Products could not be loaded. Please try again.</p>
      <Button variant="outline" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
