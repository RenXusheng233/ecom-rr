import { Hono } from 'hono'
import { paymentPrisma } from '@repo/payment-db'
import { shouldBeAdmin } from '../middleware/authMiddleware'
import { runCatalogReconciliation } from '../utils/catalogReconciliation'
import { randomUUID } from 'node:crypto'
import { archiveErrorSummary } from '../utils/catalogDiagnostics'
import {
  archiveTaskIdentitySchema,
  catalogArchiveBatchSchema,
} from '@repo/types'

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

catalogRoute.post('/archive-states', async (c) => {
  const parsed = catalogArchiveBatchSchema.safeParse(
    await c.req.json().catch(() => null),
  )
  if (!parsed.success)
    return c.json({ error: 'Invalid archive status request' }, 400)
  const items = await paymentPrisma.stripeCatalogItem.findMany({
    where: { productId: { in: [...new Set(parsed.data.productIds)] } },
    select: {
      productId: true,
      desiredEventId: true,
      desiredVersion: true,
      desiredOperation: true,
      appliedVersion: true,
      status: true,
      lastError: true,
    },
  })
  return c.json({
    items: items.map((item) => ({
      ...item,
      lastError: archiveErrorSummary(item.lastError),
    })),
  })
})

catalogRoute.post('/:productId/archive-retry', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = archiveTaskIdentitySchema.safeParse({
    ...body,
    productId: Number(c.req.param('productId')),
  })
  if (!parsed.success) return c.json({ error: 'Invalid archive task' }, 400)
  const updated = await paymentPrisma.stripeCatalogItem.updateMany({
    where: {
      productId: parsed.data.productId.toString(),
      desiredOperation: 'ARCHIVE',
      desiredEventId: parsed.data.taskId,
      desiredVersion: parsed.data.catalogVersion,
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
    : c.json(
        {
          error:
            'The archive task changed or is no longer failed. Refresh its status.',
        },
        409,
      )
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
