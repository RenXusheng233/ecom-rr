import { z } from 'zod'

export const shippingFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required!'),
  email: z.email().min(1, 'Email is required!'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]{7,20}$/, 'Enter a valid phone number'),
  city: z.string().trim().min(1, 'City is required'),
  address: z.string().trim().min(1, 'Address is required!'),
  postalCode: z.string().trim().min(1, 'Postal code is required!'),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Enter a two-letter country code')
    .transform((country) => country.toUpperCase()),
})

export const paymentFormSchema = z.object({
  cardHolder: z.string().min(1, 'Card Holder is required!'),
  cardNumber: z.string().length(16, 'Card number must be 16 digits!'),
  expirationDate: z
    .string()
    .regex(
      /^(0[1-9]|1[0-2]\/\d{2})$/,
      'Expiration date must be in MM/YY format!',
    ),
  cvv: z.string().length(3, 'CVV must be 3 digits!'),
})
