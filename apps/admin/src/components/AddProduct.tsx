'use client'

import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { Textarea } from './ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'
import { Checkbox } from './ui/checkbox'
import { ScrollArea } from './ui/scroll-area'
import { ProductFormSchema, COLORS, SIZES, CategoryType } from '@repo/types'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { useAuth } from '@clerk/nextjs'

const fetchCategories = async () => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/categories`,
  )
  if (!res.ok) {
    throw new Error('Failed to fetch categories')
  }
  return await res.json()
}

const AddProduct = () => {
  const form = useForm<z.infer<typeof ProductFormSchema>>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: {
      name: '',
      shortDescription: '',
      description: '',
      price: 0,
      categorySlug: '',
      colors: [],
      sizes: [],
      images: {},
    },
  })

  const { control } = form

  const { data: categoryData } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const { getToken } = useAuth()
  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof ProductFormSchema>) => {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_PRODUCT_SERVICE_URL}/products`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(data),
        },
      )

      if (!res.ok) {
        throw new Error('Failed to add product')
      }
    },
    onSuccess: () => {
      toast.success('Product added successfully!')
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to add product')
    },
  })

  const renderFormInputField = (
    name: 'name' | 'shortDescription' | 'description' | 'price',
    description: string,
  ) => (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{name.charAt(0).toUpperCase() + name.slice(1)}</FormLabel>
          <FormControl>
            {name === 'description' ? (
              <Textarea {...field} />
            ) : (
              <Input type="text" {...field} />
            )}
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <SheetContent>
      <ScrollArea className="h-screen">
        <SheetHeader>
          <SheetTitle className="mb-4">Add Product</SheetTitle>
          <SheetDescription asChild>
            <Form {...form}>
              <form
                className="space-y-8"
                onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
              >
                {renderFormInputField('name', 'Enter the name of the product.')}
                {renderFormInputField(
                  'shortDescription',
                  'Enter the short description of the product.',
                )}
                {renderFormInputField(
                  'description',
                  'Enter the description of the product.',
                )}
                <FormField
                  control={control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Enter the price of the product in USD.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {categoryData && (
                  <FormField
                    control={control}
                    name="categorySlug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryData?.map((cat: CategoryType) => (
                                <SelectItem key={cat.id} value={cat.slug}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormDescription>
                          Select the category of the product.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <FormField
                  control={control}
                  name="sizes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sizes</FormLabel>
                      <FormControl>
                        <div className="grid grid-cols-3 gap-4 my-2">
                          {SIZES.map((size) => (
                            <div key={size} className="flex items-center gap-2">
                              <Checkbox
                                id="size"
                                checked={field.value?.includes(size)}
                                onCheckedChange={(check) => {
                                  const currValues = field.value || []
                                  field.onChange(
                                    check
                                      ? [...currValues, size]
                                      : currValues.filter(
                                          (val) => val !== size,
                                        ),
                                  )
                                }}
                              />
                              <label htmlFor="size" className="text-xs">
                                {size}
                              </label>
                            </div>
                          ))}
                        </div>
                      </FormControl>
                      <FormDescription>
                        Select the available sizes for the product.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="colors"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Colors</FormLabel>
                      <FormControl>
                        <div className="space-y-4">
                          <div className="grid grid-cols-3 gap-4 my-2">
                            {COLORS.map((color) => (
                              <div
                                key={color}
                                className="flex items-center gap-2"
                              >
                                <Checkbox
                                  id="color"
                                  checked={field.value?.includes(color)}
                                  onCheckedChange={(check) => {
                                    const currValues = field.value || []
                                    field.onChange(
                                      check
                                        ? [...currValues, color]
                                        : currValues.filter(
                                            (val) => val !== color,
                                          ),
                                    )
                                  }}
                                />
                                <label
                                  htmlFor="color"
                                  className="text-xs flex items-center gap-2"
                                >
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  {color}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Select the available colors for the product.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="images"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Images</FormLabel>
                      <FormControl>
                        <div>
                          {form.watch('colors')?.map((color) => (
                            <div
                              key={color}
                              className="mb-4 flex items-center gap-4"
                            >
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="text-sm font-medium min-w-[60px]">
                                  {color}:
                                </span>
                              </div>
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    try {
                                      const formData = new FormData()
                                      formData.append('file', file)
                                      formData.append(
                                        'upload_preset',
                                        'ecom-rr',
                                      )

                                      const res = await fetch(
                                        `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
                                        {
                                          method: 'POST',
                                          body: formData,
                                        },
                                      )

                                      const data = await res.json()
                                      if (data.secure_url) {
                                        const currImages =
                                          form.getValues('images') || {}
                                        form.setValue('images', {
                                          ...currImages,
                                          [color]: data.secure_url,
                                        })
                                      }
                                    } catch (error) {
                                      console.log(error)
                                      toast.error('Failed to upload image')
                                    }
                                  }
                                }}
                              />
                              {field.value?.[color] ? (
                                <span className="text-green-600 text-sm">
                                  Uploaded
                                </span>
                              ) : (
                                <span className="text-red-600 text-sm">
                                  Required
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
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
      </ScrollArea>
    </SheetContent>
  )
}

export default AddProduct
