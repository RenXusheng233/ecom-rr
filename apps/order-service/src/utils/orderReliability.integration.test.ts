import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

const testDatabaseUrl = process.env.TEST_ORDER_DATABASE_URL

test(
  'supports Mongo transactions and rejects duplicate Inbox identities',
  { skip: testDatabaseUrl ? false : 'TEST_ORDER_DATABASE_URL is not set' },
  async () => {
    if (!testDatabaseUrl) return
    process.env.DATABASE_URL = testDatabaseUrl
    const {
      Order,
      OrderOutboxEvent,
      PaymentEventInbox,
      connectOrderDB,
      disconnectOrderDB,
      startOrderDbSession,
    } = await import('@repo/order-db')
    const suffix = randomUUID()
    const orderId = `integration-order-${suffix}`
    const attemptId = `integration-attempt-${suffix}`
    const inboxId = `integration-inbox-${suffix}`
    const outboxId = `integration-outbox-${suffix}`

    await connectOrderDB()
    try {
      const session = await startOrderDbSession()
      try {
        await assert.rejects(
          session.withTransaction(async () => {
            await Order.create(
              [
                {
                  orderId,
                  paymentAttemptId: attemptId,
                  stripeCheckoutSessionId: `cs_${suffix}`,
                  stripePaymentIntentId: `pi_${suffix}`,
                  paymentVersion: 1,
                  paymentStatus: 'SUCCEEDED',
                  refundStatus: 'NONE',
                  disputeStatus: 'NONE',
                  userId: `integration-user-${suffix}`,
                  email: null,
                  amountTotal: 1000,
                  amountRefunded: 0,
                  currency: 'usd',
                  products: [
                    {
                      productId: 'integration-product',
                      name: 'Integration product',
                      unitAmount: 1000,
                      quantity: 1,
                      selectedSize: 'one-size',
                      selectedColor: 'black',
                    },
                  ],
                  shipping: null,
                },
              ],
              { session },
            )
            await OrderOutboxEvent.create(
              [
                {
                  eventId: outboxId,
                  orderId,
                  aggregateVersion: 1,
                  topic: 'order.payment.applied',
                  messageKey: orderId,
                  eventType: 'order.payment.applied',
                  payload: { integration: true },
                },
              ],
              { session },
            )
            throw new Error('force transaction rollback')
          }),
          /force transaction rollback/,
        )
      } finally {
        await session.endSession()
      }

      assert.equal(await Order.exists({ orderId }), null)
      assert.equal(await OrderOutboxEvent.exists({ eventId: outboxId }), null)

      const inbox = {
        eventId: inboxId,
        orderId,
        aggregateVersion: 1,
        eventType: 'payment.succeeded',
        payload: { integration: true },
      }
      await PaymentEventInbox.create(inbox)
      await assert.rejects(
        PaymentEventInbox.create(inbox),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000,
      )
    } finally {
      await Promise.all([
        Order.deleteMany({ orderId }),
        OrderOutboxEvent.deleteMany({ eventId: outboxId }),
        PaymentEventInbox.deleteMany({ eventId: inboxId }),
      ])
      await disconnectOrderDB()
    }
  },
)
