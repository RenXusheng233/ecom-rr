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

const app = new Hono()

app.use('*', clerkMiddleware())
app.use(
  '*',
  cors({
    origin: ['http://localhost:3000'],
  }),
)

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

const start = async () => {
  try {
    await paymentPrisma.$connect()
    await producer.connect()
    await consumer.connect()
    await runKafkaSubscriptions()
    startCatalogSyncWorker()
    startPaymentOutboxWorker()
    startCatalogReconciliation()
    serve(
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

start()
