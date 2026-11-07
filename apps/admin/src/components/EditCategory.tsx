'use client'

import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CategoryFormSchema, type CategoryType } from '@repo/types'
import type { z } from 'zod'
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form'
import { Button } from './ui/button'
import { Input } from './ui/input'
import CategorySlugField from './CategorySlugField'

export default function EditCategory({ category }: { category: CategoryType }) {
  const [open, setOpen] = useState(false)
  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()
  const form = useForm<z.infer<typeof CategoryFormSchema>>({
    resolver: zodResolver(CategoryFormSchema),
    defaultValues: { name: category.name, slug: category.slug },
  })
  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof CategoryFormSchema>) => {
      const token = await getToken()
      if (!token) throw new Error('Please sign in again')
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/categories/${category.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        },
      )
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error ?? 'Failed to update category')
      }
    },
    onSuccess: () => {
      toast.success('Category updated successfully')
      setOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.refresh()
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (mutation.isPending) return
        if (nextOpen) {
          form.reset({ name: category.name, slug: category.slug })
          mutation.reset()
        }
        setOpen(nextOpen)
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Edit ${category.name}`}
        >
          Edit
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Category</SheetTitle>
          <SheetDescription>
            Update the category name and slug.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            className="space-y-6 px-4"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          >
            <fieldset disabled={mutation.isPending} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <CategorySlugField
                control={form.control}
                disabled={mutation.isPending}
              />
              <p className="text-sm text-muted-foreground">
                Changing the slug also updates products in this category.
              </p>
              {mutation.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {mutation.error.message}
                </p>
              ) : null}
              <Button type="submit">
                {mutation.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </fieldset>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
