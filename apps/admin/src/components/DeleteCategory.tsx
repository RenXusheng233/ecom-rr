'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AdminCategoryType } from '@repo/types'
import { useRouter } from 'next/navigation'
import { toast } from 'react-toastify'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet'
import { Button } from './ui/button'

export default function DeleteCategory({
  category,
}: {
  category: AdminCategoryType
}) {
  const [open, setOpen] = useState(false)
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()
  const hasProducts = category.productCount > 0
  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('Please sign in again')
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/categories/${category.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        },
      )
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error ?? 'Failed to delete category')
      }
    },
    onSuccess: () => {
      toast.success('Category deleted successfully')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.refresh()
    },
    onError: (error) => {
      toast.error(error.message)
      router.refresh()
    },
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return
        if (nextOpen) mutation.reset()
        setOpen(nextOpen)
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          disabled={hasProducts}
          aria-label={`Delete ${category.name}`}
          title={
            hasProducts
              ? 'Move products before deleting this category.'
              : undefined
          }
        >
          Delete
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Delete {category.name}?</SheetTitle>
          <SheetDescription>
            This permanently deletes the category ({category.slug}). This action
            cannot be undone.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          {hasProducts ? (
            <p role="alert" className="text-sm text-destructive">
              This category still has products. Move them to another category
              before deleting it.
            </p>
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
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.isPending || hasProducts}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? 'Deleting...' : 'Delete category'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
