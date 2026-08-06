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
import { useAuth } from '@clerk/nextjs'
import { toast } from 'react-toastify'
import { useMutation } from '@tanstack/react-query'
import { UserFormSchema } from '@repo/types'

const AddUser = () => {
  const form = useForm<z.infer<typeof UserFormSchema>>({
    resolver: zodResolver(UserFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      username: '',
      emailAddress: [''],
      password: '',
    },
  })

  const { control } = form

  const { getToken } = useAuth()
  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof UserFormSchema>) => {
      const token = await getToken()
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}/users`,
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
        throw new Error('Failed to create user')
      }
    },
    onSuccess: () => {
      toast.success('User created successfully')
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`)
    },
  })

  const renderFormInputField = (
    name: 'firstName' | 'lastName' | 'username' | 'password',
    description: string,
  ) => (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{name.charAt(0).toUpperCase() + name.slice(1)}</FormLabel>
          <FormControl>
            <Input
              type={name === 'password' ? 'password' : 'text'}
              {...field}
            />
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
            <form
              className="space-y-8"
              onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
            >
              {renderFormInputField('firstName', 'Enter user first name.')}
              {renderFormInputField('lastName', 'Enter user last name.')}
              {renderFormInputField('username', 'Enter username.')}
              <FormField
                control={control}
                name="emailAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="email1@gmail.com, email2@gmail.com"
                        value={field.value ? field.value.join(', ') : ''}
                        onChange={(e) => {
                          const emails = e.target.value
                            .split(',')
                            .map((email) => email.trim())
                          field.onChange(emails)
                        }}
                        onBlur={() => {
                          if (Array.isArray(field.value)) {
                            const cleaned = field.value
                              .map((e) => e.trim())
                              .filter(Boolean)
                            field.onChange(cleaned)
                          }
                          field.onBlur()
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Only admin can see your email.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {renderFormInputField('password', 'Enter user password.')}
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

export default AddUser
