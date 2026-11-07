'use client'

import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useAuth } from '@clerk/nextjs'
import { CategoryFormSchema } from '@repo/types'
import { createCategorySlug } from '@repo/types/category'
import {
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from './ui/sheet'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from './ui/form'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { useRouter } from 'next/navigation'
import CategorySlugField from './CategorySlugField'

const AddCategory = () => {
  const form = useForm<z.infer<typeof CategoryFormSchema>>({
    resolver: zodResolver(CategoryFormSchema),
    defaultValues: {
      name: '',
      slug: '',
    },
  })

  const { control } = form
  const { dirtyFields, isSubmitted } = form.formState

  const { getToken } = useAuth()
  const queryClient = useQueryClient()
  const router = useRouter()
  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof CategoryFormSchema>) => {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/categories`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          method: 'POST',
          body: JSON.stringify(data),
        },
      )
      if (!res.ok) {
        const result = await res.json().catch(() => null)
        throw new Error(result?.error ?? 'Failed to create category')
      }
    },
    onSuccess: () => {
      toast.success('Category created successfully')
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.refresh()
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`)
    },
  })

  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle className="mb-4">Add Category</SheetTitle>
        <SheetDescription asChild>
          <Form {...form}>
            <form
              className="space-y-8"
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            >
              <FormField
                control={control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        onChange={(event) => {
                          field.onChange(event)
                          if (!dirtyFields.slug) {
                            form.setValue(
                              'slug',
                              createCategorySlug(event.target.value),
                              { shouldValidate: isSubmitted },
                            )
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>Enter the category name.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <CategorySlugField
                control={control}
                disabled={mutation.isPending}
                description="Choose one of the seven presets using the arrow, or enter a custom slug. Generated from the name until you choose or type a slug."
              />
              <Button
                type="submit"
                disabled={mutation.isPending}
                className="disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? 'Submitting...' : 'Submit'}
              </Button>
            </form>
          </Form>
        </SheetDescription>
      </SheetHeader>
    </SheetContent>
  )
}

export default AddCategory
