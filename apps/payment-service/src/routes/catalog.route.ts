import { Hono } from 'hono'
import { paymentPrisma } from '@repo/payment-db'
import { shouldBeAdmin } from '../middleware/authMiddleware'
import { runCatalogReconciliation } from '../utils/catalogReconciliation'
import { randomUUID } from 'node:crypto'

const catalogRoute = new Hono()

catalogRoute.use('*', shouldBeAdmin)

catalogRoute.get('/summary', async (c) => {
  const groups = await paymentPrisma.stripeCatalogItem.groupBy({
    by: ['status'],
    _count: { _all: true },
  })
  return c.json(
    Object.fromEntries(
      groups.map((group) => [group.status, group._count._all]),
    ),
  )
})

catalogRoute.post('/reconcile', async (c) => {
  return c.json(await runCatalogReconciliation())
})

catalogRoute.get('/:productId', async (c) => {
  const item = await paymentPrisma.stripeCatalogItem.findUnique({
    where: { productId: c.req.param('productId') },
  })
  return item ? c.json(item) : c.json({ error: 'Catalog item not found' }, 404)
})

catalogRoute.post('/:productId/retry', async (c) => {
  const updated = await paymentPrisma.stripeCatalogItem.updateMany({
    where: {
      productId: c.req.param('productId'),
      status: 'FAILED',
    },
    data: {
      status: 'PENDING',
      desiredRunId: randomUUID(),
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      claimToken: null,
      processingVersion: null,
      lastError: null,
    },
  })
  return updated.count
    ? c.json({ queued: true })
    : c.json({ error: 'Failed catalog item not found' }, 404)
})

export default catalogRoute
