import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-12-15.clover',
  maxNetworkRetries: 2,
  timeout: 30000,
})

export default stripe
