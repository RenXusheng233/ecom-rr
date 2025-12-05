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

const formSchema = z.object({
  fullName: z
    .string()
    .min(2, 'Username must be at least 2 characters!')
    .max(50, 'Username must be less than 50 characters!'),
  email: z.email('Invalid email!').min(1),
  phone: z
    .string()
    .length(11, 'Phone number must be 11 digits')
    .regex(/^\d+$/, 'Phone number must contain only numbers!'),
  address: z.string().min(1, 'Location is required!'),
  city: z.string().min(1, 'City is required!'),
})

const AddUser = () => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
    },
  })

  const { control } = form

  const renderFormInputField = (
    name: 'fullName' | 'email' | 'phone' | 'address' | 'city',
    description: string,
  ) => (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{name.charAt(0).toUpperCase() + name.slice(1)}</FormLabel>
          <FormControl>
            <Input type={name === 'email' ? 'email' : 'text'} {...field} />
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
        <SheetTitle className="mb-4">Add User</SheetTitle>
        <SheetDescription asChild>
          <Form {...form}>
            <form className="space-y-8">
              {renderFormInputField('fullName', 'Enter user full name.')}
              {renderFormInputField('email', 'Only admin can see your email.')}
              {renderFormInputField(
                'phone',
                'Only admin can see your phone number (optional).',
              )}
              {renderFormInputField('address', 'Enter your adress (optional).')}
              {renderFormInputField('city', 'Enter your city (optional).')}
              <Button type="submit">Submit</Button>
            </form>
          </Form>
        </SheetDescription>
      </SheetHeader>
    </SheetContent>
  )
}

export default AddUser
