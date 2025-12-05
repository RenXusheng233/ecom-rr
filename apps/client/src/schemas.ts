import { z } from 'zod'

export const shippingFormSchema = z.object({
  name: z.string().min(1, 'Name is required!'),
  email: z.email().min(1, 'Email is required!'),
  phone: z
    .string()
    .length(11, 'Phone number must be 11 digits!')
    .regex(/^\d+$/, 'Phone number must contain only numbers!'),
  city: z.string().min(1, 'City is required'),
  address: z.string().min(1, 'Address is required!'),
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
