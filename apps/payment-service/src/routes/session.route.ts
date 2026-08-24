import { Hono } from 'hono'
import stripe from '../utils/stripe'
import { shouldBeUser } from '../middleware/authMiddleware'
import { CartItemType } from '@repo/types'
import { paymentPrisma } from '@repo/payment-db'
import {
  buildCheckoutLineItemsWithFallback,
  CatalogSyncPendingError,
} from '../utils/checkoutCatalog'

const sessionRoute = new Hono()
const PORT = 3000

const resolveLegacyStripePrice = async (productId: string) => {
  try {
    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    })
    if (!product.active || typeof product.default_price === 'string')
      return null
    return product.default_price?.active ? product.default_price.id : null
  } catch {
    return null
  }
}

sessionRoute.post('/create-checkout-session', shouldBeUser, async (c) => {
  const { cart }: { cart: CartItemType[] } = await c.req.json()
  const userId = c.get('userId')

  try {
    const catalogItems = await paymentPrisma.stripeCatalogItem.findMany({
      where: {
        productId: { in: cart.map((item) => item.id.toString()) },
      },
    })
    const lineItems = await buildCheckoutLineItemsWithFallback(
      cart,
      catalogItems,
      process.env.CATALOG_SYNC_ENFORCEMENT === 'true',
      resolveLegacyStripePrice,
    )
    const session = await stripe.checkout.sessions.create({
      client_reference_id: userId,
      line_items: lineItems,
      mode: 'payment',
      ui_mode: 'custom',
      return_url: `http://localhost:${PORT}/return?session_id={CHECKOUT_SESSION_ID}`,
    })

    return c.json({ checkoutSessionClientSecret: session.client_secret })
  } catch (error) {
    if (error instanceof CatalogSyncPendingError) {
      return c.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        409,
      )
    }
    console.error(error)
    return c.json({ error: { code: 'CHECKOUT_SESSION_FAILED' } }, 500)
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
    console.error(error)
    return c.json({ error: { code: 'CHECKOUT_SESSION_LOOKUP_FAILED' } }, 500)
  }
})

export default sessionRoute
