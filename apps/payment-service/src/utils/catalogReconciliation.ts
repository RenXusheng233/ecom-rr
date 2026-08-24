import { paymentPrisma } from '@repo/payment-db'
import { randomUUID } from 'node:crypto'
import { hasCatalogDrift } from './catalogDrift'
import {
  archiveStripeCatalogItem,
  inspectStripeCatalogItem,
  listStripeCatalogProducts,
} from './stripeCatalog'

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

    await archiveStripeCatalogItem(
      product.productId,
      product.catalogVersion + 1,
      randomUUID(),
    )
    archivedOrphans += 1
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
