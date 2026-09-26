import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

test(
  'summary counts successful payments with a stale order projection',
  { skip: !process.env.TEST_PAYMENT_DATABASE_URL },
  async () => {
    const originalDatabaseUrl = process.env.PAYMENT_DATABASE_URL
    process.env.PAYMENT_DATABASE_URL = process.env.TEST_PAYMENT_DATABASE_URL
    const { paymentPrisma } = await import('@repo/payment-db')
    const { successfulPaymentsAwaitingOrderWhere } =
      await import('./paymentOrderSync.route')

    try {
      const testId = randomUUID()
      const stale = await paymentPrisma.checkoutAttempt.create({
        data: {
          userId: `test-${testId}`,
          clientRequestId: randomUUID(),
          requestHash: 'test',
          amountTotal: 100,
          itemsSnapshot: [],
          paymentStatus: 'SUCCEEDED',
          version: 2,
          orderAppliedVersion: 1,
          orderExists: true,
        },
      })
      const current = await paymentPrisma.checkoutAttempt.create({
        data: {
          userId: `test-${testId}`,
          clientRequestId: randomUUID(),
          requestHash: 'test',
          amountTotal: 100,
          itemsSnapshot: [],
          paymentStatus: 'SUCCEEDED',
          version: 2,
          orderAppliedVersion: 2,
          orderExists: true,
        },
      })

      const count = await paymentPrisma.checkoutAttempt.count({
        where: {
          ...successfulPaymentsAwaitingOrderWhere,
          id: { in: [stale.id, current.id] },
        },
      })
      assert.equal(count, 1)
    } finally {
      await paymentPrisma.$disconnect()
      if (originalDatabaseUrl === undefined)
        delete process.env.PAYMENT_DATABASE_URL
      else process.env.PAYMENT_DATABASE_URL = originalDatabaseUrl
    }
  },
)
