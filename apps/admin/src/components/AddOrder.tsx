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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

const formSchema = z.object({
  amount: z.number().min(1, 'Price must be at least 1!'),
  userId: z.string().min(1, 'User Id is required!'),
  status: z.enum(['pending', 'success', 'failed']),
})

const AddOrder = () => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      userId: '',
    },
  })

  const { control } = form

  const renderFormInputField = (
    name: 'amount' | 'userId',
    description: string,
  ) => (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{name.charAt(0).toUpperCase() + name.slice(1)}</FormLabel>
          <FormControl>
            <Input type={name === 'amount' ? 'number' : 'text'} {...field} />
          </FormControl>
          <FormDescription>{description}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )

  return (
    <SheetContent>
      <SheetHeader>
        <SheetTitle className="mb-4">Add Order</SheetTitle>
        <SheetDescription asChild>
          <Form {...form}>
            <form className="space-y-8">
              {renderFormInputField('amount', 'Enter the amount of the order.')}
              {renderFormInputField('userId', 'Enter the User Id.')}
              <FormField
                control={control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <FormControl>
                      <Select {...field}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="success">Success</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormDescription>
                      Select the status of the order.
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
    </SheetContent>
  )
}

export default AddOrder
