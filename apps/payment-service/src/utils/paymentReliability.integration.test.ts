import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

const testDatabaseUrl = process.env.TEST_PAYMENT_DATABASE_URL

test(
  'rolls back the payment state and lifecycle Outbox together',
  { skip: testDatabaseUrl ? false : 'TEST_PAYMENT_DATABASE_URL is not set' },
  async () => {
    if (!testDatabaseUrl) return
    process.env.PAYMENT_DATABASE_URL = testDatabaseUrl
    const { paymentPrisma } = await import('@repo/payment-db')
    const attemptId = randomUUID()
    const orderId = randomUUID()
    const outboxId = randomUUID()

    try {
      await paymentPrisma.checkoutAttempt.create({
        data: {
          id: attemptId,
          orderId,
          userId: `integration-user-${attemptId}`,
          clientRequestId: randomUUID(),
          requestHash: 'integration-request',
          amountTotal: 1000,
          itemsSnapshot: [
            {
              productId: 'integration-product',
              name: 'Integration product',
              unitAmount: 1000,
              currency: 'usd',
              stripePriceId: 'price_integration',
              quantity: 1,
              selectedSize: 'one-size',
              selectedColor: 'black',
            },
          ],
          stripeCheckoutSessionId: `cs_integration_${attemptId}`,
        },
      })

      await assert.rejects(
        paymentPrisma.$transaction(async (tx) => {
          await tx.checkoutAttempt.update({
            where: { id: attemptId },
            data: { paymentStatus: 'SUCCEEDED', version: 1 },
          })
          await tx.paymentOutboxEvent.create({
            data: {
              id: outboxId,
              aggregateId: orderId,
              aggregateVersion: 1,
              topic: 'payment.order.lifecycle',
              messageKey: orderId,
              eventType: 'payment.succeeded',
              payload: { integration: true },
            },
          })
          throw new Error('force transaction rollback')
        }),
        /force transaction rollback/,
      )

      const [attempt, outbox] = await Promise.all([
        paymentPrisma.checkoutAttempt.findUnique({ where: { id: attemptId } }),
        paymentPrisma.paymentOutboxEvent.findUnique({
          where: { id: outboxId },
        }),
      ])
      assert.equal(attempt?.paymentStatus, 'CREATING')
      assert.equal(attempt?.version, 0)
      assert.equal(outbox, null)
    } finally {
      await paymentPrisma.paymentOutboxEvent.deleteMany({
        where: { id: outboxId },
      })
      await paymentPrisma.checkoutAttempt.deleteMany({
        where: { id: attemptId },
      })
      await paymentPrisma.$disconnect()
    }
  },
)
