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
import { CATEGORIES, COLORS, SIZES } from '@/lib/consts'
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

const formSchema = z.object({
  name: z.string().min(1, 'Product name is required!'),
  shortDescription: z.string().min(1, 'Short description is required!').max(60),
  description: z.string().min(1, 'Description is required!'),
  price: z.number().min(1, 'Price is required!'),
  category: z.enum(CATEGORIES),
  colors: z.array(z.enum(COLORS)),
  sizes: z.array(z.enum(SIZES)),
  images: z.record(z.enum(COLORS), z.string().min(1, 'Image is required!')),
})

const AddProduct = () => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      shortDescription: '',
      description: '',
      price: 0,
    },
  })

  const { control } = form

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
              <Input type={name === 'price' ? 'number' : 'text'} {...field} />
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
              <form className="space-y-8">
                {renderFormInputField('name', 'Enter the name of the product.')}
                {renderFormInputField(
                  'shortDescription',
                  'Enter the short description of the product.',
                )}
                {renderFormInputField(
                  'description',
                  'Enter the description of the product.',
                )}
                {renderFormInputField(
                  'price',
                  'Enter the price of the product.',
                )}
                <FormField
                  control={control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <FormControl>
                        <Select {...field}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
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
                          {field.value && field.value.length > 0 && (
                            <div className="mt-8 space-y-4">
                              <p className="text-sm font-medium">
                                Upload images for selected colors:
                              </p>
                              {field.value.map((color) => (
                                <div
                                  key={color}
                                  className="flex items-center gap-2"
                                >
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="text-sm min-w-[60px]">
                                    {color}
                                  </span>
                                  <Input type="file" accept="images/*" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        Select the available colors for the product.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit">Submit</Button>
              </form>
            </Form>
          </SheetDescription>
        </SheetHeader>
      </ScrollArea>
    </SheetContent>
  )
}

export default AddProduct
