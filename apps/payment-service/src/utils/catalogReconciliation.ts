import { paymentPrisma } from '@repo/payment-db'
import { randomUUID } from 'node:crypto'
import { hasCatalogDrift } from './catalogDrift'
import { invalidateAfterStaleMutation } from './catalogWorker'
import {
  archiveStripeCatalogItem,
  inspectStripeCatalogItem,
  listStripeCatalogProducts,
} from './stripeCatalog'

class CatalogNoLongerOrphanError extends Error {}

export const runCatalogReconciliation = async () => {
  const items = await paymentPrisma.stripeCatalogItem.findMany()
  let drifted = 0

  for (const item of items) {
    const actual = await inspectStripeCatalogItem(item.productId)
    if (
      !hasCatalogDrift(
        {
          operation: item.desiredOperation,
          name: item.desiredName,
          unitAmount: item.desiredUnitAmount,
          catalogVersion: item.desiredVersion,
          stripePriceId: item.stripePriceId,
        },
        actual,
      )
    ) {
      continue
    }

    drifted += 1
    if (item.status === 'PROCESSING') continue
    await paymentPrisma.stripeCatalogItem.updateMany({
      where: {
        productId: item.productId,
        desiredVersion: item.desiredVersion,
        status: { not: 'PROCESSING' },
      },
      data: {
        status: 'PENDING',
        desiredRunId: randomUUID(),
        attempts: 0,
        nextAttemptAt: new Date(),
        leaseUntil: null,
        lastError: 'Catalog reconciliation detected Stripe drift',
      },
    })
  }

  const knownProducts = new Set(items.map((item) => item.productId))
  const stripeProducts = await listStripeCatalogProducts()
  let archivedOrphans = 0
  let unmanagedProducts = 0
  for (const product of stripeProducts) {
    if (!product.managed) {
      unmanagedProducts += 1
      continue
    }
    if (!product.active || knownProducts.has(product.productId)) continue

    const isKnown = async () =>
      (await paymentPrisma.stripeCatalogItem.count({
        where: { productId: product.productId },
      })) > 0
    if (await isKnown()) continue

    const archiveToken = randomUUID()
    let mutationStarted = false
    try {
      await archiveStripeCatalogItem(
        product.productId,
        product.catalogVersion + 1,
        archiveToken,
        async () => {
          if (await isKnown()) throw new CatalogNoLongerOrphanError()
          mutationStarted = true
        },
      )
      if (!(await isKnown())) archivedOrphans += 1
    } catch (error) {
      if (!(error instanceof CatalogNoLongerOrphanError)) throw error
    } finally {
      // A ledger insert can race with a Stripe write or its response. Fence
      // concurrent claims and publish an invalidation before repairing it.
      if (mutationStarted && (await isKnown())) {
        await invalidateAfterStaleMutation(product.productId, archiveToken)
      }
    }
  }

  return {
    checked: items.length,
    drifted,
    archivedOrphans,
    unmanagedProducts,
  }
}

export const startCatalogReconciliation = () => {
  let running = false
  const reconcile = async () => {
    if (running) return
    running = true
    try {
      const result = await runCatalogReconciliation()
      console.log('Catalog reconciliation completed', result)
    } catch (error) {
      console.error('Catalog reconciliation failed', error)
    } finally {
      running = false
    }
  }

  return setInterval(() => void reconcile(), 15 * 60 * 1000)
}
