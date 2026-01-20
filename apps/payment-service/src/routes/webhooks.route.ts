import { Hono } from 'hono'
import Stripe from 'stripe'
import stripe from '../utils/stripe'
import { producer } from '../utils/kafka'
import { topics } from '@repo/kafka'

const webhookRoute = new Hono()

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRECT!

webhookRoute.post('/stripe', async (c) => {
  const body = await c.req.text()
  const sig = c.req.header('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (error) {
    console.log('Webhook verification failed!\n', error)
    return c.json({ error: 'Webhook verification failed!' }, 400)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id)
      const shipping = session.collected_information?.shipping_details
      let shipping_address = ''
      if (shipping) {
        const { address } = shipping
        shipping_address = `${address.line1}, ${address.line2}, ${address.country}`
      }

      producer.send(topics.payment_successful, {
        value: {
          userId: session.client_reference_id,
          email: session.customer_details?.email,
          amount: session.amount_total,
          status: session.payment_status === 'paid' ? 'success' : 'failed',
          products: lineItems.data.map((item) => ({
            name: item.description,
            quantity: item.quantity,
            price: item.price?.unit_amount,
          })),
          address: shipping_address,
        },
      })
      break
    }

    default:
      break
  }

  return c.json({ received: true })
})

export default webhookRoute
