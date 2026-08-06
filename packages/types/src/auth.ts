import { z } from 'zod'

export interface CustomJwtSessionClaims {
  metadata?: {
    role?: 'user' | 'admin'
  }
}

export const UserFormSchema = z.object({
  firstName: z
    .string('First name is required!')
    .min(2, 'First name must be at least 2 characters!')
    .max(50, 'First name must be less than 50 characters!'),
  lastName: z
    .string('Last name is required!')
    .min(2, 'Last name must be at least 2 characters!')
    .max(50, 'Last name must be less than 50 characters!'),
  username: z
    .string('Username is required!')
    .min(2, 'Username must be at least 2 characters!')
    .max(50, 'Username must be less than 50 characters!'),
  emailAddress: z.array(z.string('Email is required!')),
  password: z
    .string('Password is required!')
    .min(8, 'Password must be at least 8 characters!')
    .max(50, 'Password must be less than 50 characters!'),
})
