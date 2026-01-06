import { Hono } from 'hono'
import stripe from '../utils/stripe'
import { shouldBeUser } from '../middleware/authMiddleware'
import { CartItemType } from '@repo/types'
import { getStripeProductPrice } from '../utils/stripeProduct'

const sessionRoute = new Hono()
const PORT = 3000

sessionRoute.post('/create-checkout-session', shouldBeUser, async (c) => {
  const { cart }: { cart: CartItemType[] } = await c.req.json()
  const userId = c.get('userId')
  const lineItems = await Promise.all(
    cart.map(async ({ id, name, quantity }) => {
      const unitAmount = await getStripeProductPrice(id)
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name,
          },
          unit_amount: unitAmount as number,
        },
        quantity,
      }
    }),
  )

  try {
    const session = await stripe.checkout.sessions.create({
      client_reference_id: userId,
      line_items: lineItems,
      mode: 'payment',
      ui_mode: 'custom',
      return_url: `http://localhost:${PORT}/return?session_id={CHECKOUT_SESSION_ID}`,
    })

    return c.json({ checkoutSessionClientSecret: session.client_secret })
  } catch (error) {
    console.log(error)
    return c.json({ error })
  }
})

sessionRoute.get('/:session_id', async (c) => {
  const { session_id } = c.req.param()
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items'],
    })

    return c.json({
      status: session.status,
      paymentStatus: session.payment_status,
    })
  } catch (error) {
    console.log(error)
    c.json({ error })
  }
})

export default sessionRoute
