'use client'

import { useAuth } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { productDeletionTaskSchema, type AdminProductType } from '@repo/types'
import { toast } from 'react-toastify'
import {
  deleteProductBatch,
  type ProductDeletionBatchResult,
} from '@/lib/product-deletions'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet'
import { Button } from './ui/button'

export default function DeleteProducts({
  products,
  onOpenChange,
  onResult,
}: {
  products: Array<Pick<AdminProductType, 'id' | 'name'>>
  onOpenChange: (open: boolean) => void
  onResult: (result: ProductDeletionBatchResult) => void
}) {
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('Please sign in again')
      return deleteProductBatch(products, async (id) => {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/products/${id}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        )
        if (!response.ok)
          throw new Error(
            'Product could not be deleted. Refresh the list and retry.',
          )
        const receipt = productDeletionTaskSchema.safeParse(
          (await response.json()).deletionTask,
        )
        if (!receipt.success || receipt.data.productId !== id) {
          throw new Error(
            'Deletion could not be confirmed. Check the archive tasks before retrying.',
          )
        }
      })
    },
    onSuccess: (result) => {
      onResult(result)
      void queryClient.invalidateQueries({ queryKey: ['product-deletions'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.refresh()
      if (result.failures.length === 0) {
        toast.success(
          'Product(s) deleted locally. Check Stripe archive tasks for completion.',
        )
        onOpenChange(false)
      } else {
        toast.warning(
          `${result.deletedIds.length} deleted; ${result.failures.length} could not be confirmed.`,
        )
      }
    },
    onError: () =>
      toast.error('Deletion could not be completed. Please try again.'),
  })

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!mutation.isPending) onOpenChange(open)
      }}
    >
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Delete {products.length} product(s)?</SheetTitle>
          <SheetDescription>
            These products will be permanently removed from the store. Stripe
            products and prices will be archived asynchronously. Local deletion
            cannot be undone.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-4">
          <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
            {products.map((product) => (
              <li key={product.id} className="break-words">
                {product.name}{' '}
                <span className="text-muted-foreground">#{product.id}</span>
              </li>
            ))}
          </ul>
          {mutation.data?.failures.length ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>
                {mutation.data.deletedIds.length} deleted locally.{' '}
                {mutation.data.failures.length} could not be confirmed.
              </p>
              {mutation.data.failures.map((failure) => (
                <p key={failure.id} className="text-destructive">
                  #{failure.id}: {failure.error}
                </p>
              ))}
            </div>
          ) : null}
          {mutation.error ? (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.isPending || products.length === 0}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? 'Deleting...'
                : mutation.data?.failures.length
                  ? 'Retry failed products'
                  : 'Delete products'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
