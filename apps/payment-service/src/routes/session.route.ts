import { Hono } from 'hono'
import stripe from '../utils/stripe'
import { shouldBeUser } from '../middleware/authMiddleware'

const sessionRoute = new Hono()
const PORT = 3000

sessionRoute.post('/create-checkout-session', shouldBeUser, async (c) => {
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'T-shirt',
            },
            unit_amount: 2000,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      ui_mode: 'custom',
      // The URL of your payment completion page
      return_url: `http://localhost:${PORT}/return?session_id={CHECKOUT_SESSION_ID}`,
    })

    return c.json({ checkoutSessionClientSecret: session.client_secret })
  } catch (error) {
    console.log(error)
    return c.json({ error })
  }
})

export default sessionRoute
