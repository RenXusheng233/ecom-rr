import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { clerkMiddleware } from '@hono/clerk-auth'
import { shouldBeUser } from './middleware/authMiddleware.js'
import { cors } from 'hono/cors'
import sessionRoute from './routes/session.route.js'
import webhookRoute from './routes/webhooks.route.js'
import { consumer, producer } from './utils/kafka.js'
import { runKafkaSubscriptions } from './utils/subscriptions.js'
import { paymentPrisma } from '@repo/payment-db'
import catalogRoute from './routes/catalog.route.js'
import { startCatalogSyncWorker } from './utils/catalogWorker.js'
import { startPaymentOutboxWorker } from './utils/paymentOutboxWorker.js'
import { startCatalogReconciliation } from './utils/catalogReconciliation.js'
import { startStripeWebhookWorker } from './utils/stripeWebhookWorker.js'
import paymentOrderSyncRoute from './routes/paymentOrderSync.route.js'
import { startPaymentOrderReconciliation } from './utils/paymentReconciliation.js'

const app = new Hono()

app.use('*', clerkMiddleware())
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
  }),
)

const workerIntervals: NodeJS.Timeout[] = []
let server: ReturnType<typeof serve> | undefined
let shuttingDown = false

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  })
})

app.get('/test', shouldBeUser, async (c) => {
  const clerkClient = c.get('clerk')
  try {
    const user = await clerkClient.users.getUser(c.get('userId'))

    return c.json({
      message: 'User retrieved from payment service',
      user,
    })
  } catch (error) {
    console.error(error)
    return c.json(
      {
        message: 'Failed to retrieve user from payment service',
      },
      500,
    )
  }
})

app.route('/sessions', sessionRoute)
app.route('/webhooks', webhookRoute)
app.route('/catalog-sync', catalogRoute)
app.route('/payment-order-sync', paymentOrderSyncRoute)

const start = async () => {
  try {
    await paymentPrisma.$connect()
    await producer.connect()
    await consumer.connect()
    await runKafkaSubscriptions()
    workerIntervals.push(
      startCatalogSyncWorker(),
      startStripeWebhookWorker(),
      startPaymentOutboxWorker(),
      startCatalogReconciliation(),
      startPaymentOrderReconciliation(),
    )
    server = serve(
      {
        fetch: app.fetch,
        port: 8002,
      },
      (info) => {
        console.log(`Payment service is running on port ${info.port}`)
      },
    )
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  workerIntervals.forEach(clearInterval)
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    )
  }
  await Promise.allSettled([consumer.disconnect(), producer.disconnect()])
  await paymentPrisma.$disconnect()
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())

void start()
