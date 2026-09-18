import { Hono } from 'hono'
import type Stripe from 'stripe'
import type { Prisma } from '@repo/payment-db'

type WebhookRouteDependencies = {
  verifyEvent(
    body: string,
    signature: string,
  ): Stripe.Event | Promise<Stripe.Event>
  persistEvent(event: Stripe.Event): Promise<void>
}

export const createWebhookRoute = (dependencies: WebhookRouteDependencies) => {
  const route = new Hono()

  route.post('/stripe', async (context) => {
    const signature = context.req.header('stripe-signature')
    if (!signature) {
      return context.json({ error: { code: 'INVALID_WEBHOOK_SIGNATURE' } }, 400)
    }

    let event: Stripe.Event
    try {
      event = await dependencies.verifyEvent(
        await context.req.text(),
        signature,
      )
    } catch {
      return context.json({ error: { code: 'INVALID_WEBHOOK_SIGNATURE' } }, 400)
    }

    try {
      await dependencies.persistEvent(event)
    } catch (error) {
      console.error('Stripe Webhook Inbox persistence failed', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return context.json(
        { error: { code: 'WEBHOOK_PERSISTENCE_FAILED' } },
        500,
      )
    }

    return context.json({ received: true })
  })

  return route
}

const realDependencies: WebhookRouteDependencies = {
  verifyEvent: async (body, signature) => {
    const { default: stripe } = await import('../utils/stripe')
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is required')
    return stripe.webhooks.constructEvent(body, signature, webhookSecret)
  },
  persistEvent: async (event) => {
    const { paymentPrisma } = await import('@repo/payment-db')
    await paymentPrisma.stripeWebhookInboxEvent.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        eventType: event.type,
        stripeCreatedAt: new Date(event.created * 1000),
        payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
      },
      update: {},
    })
  },
}

export default createWebhookRoute(realDependencies)
