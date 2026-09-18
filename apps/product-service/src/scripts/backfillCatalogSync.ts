import { randomUUID } from 'node:crypto'
import { prisma } from '@repo/product-db'
import { createCatalogSyncRequestedEvent } from '../utils/catalogSync'
import { needsCatalogOptionBackfill } from '../utils/catalogBackfill'

const BATCH_SIZE = 100

const backfill = async () => {
  let cursor: number | undefined
  let scanned = 0

  while (true) {
    const products = await prisma.product.findMany({
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (products.length === 0) break

    for (const product of products) {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "Product"
          WHERE "id" = ${product.id}
          FOR UPDATE
        `
        const current = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
        })
        const currentOutbox = await tx.productOutboxEvent.findUnique({
          where: {
            aggregateId_aggregateVersion_operation: {
              aggregateId: current.id.toString(),
              aggregateVersion: current.catalogVersion,
              operation: 'UPSERT',
            },
          },
        })
        if (
          currentOutbox &&
          !needsCatalogOptionBackfill(currentOutbox.payload)
        ) {
          return
        }

        const updated = await tx.product.update({
          where: { id: current.id },
          data: {
            catalogVersion: { increment: 1 },
            stripeSyncStatus: 'PENDING',
            stripeSyncedAt: null,
            stripeSyncError: null,
          },
        })
        const eventId = randomUUID()
        const event = createCatalogSyncRequestedEvent({
          eventId,
          occurredAt: new Date(),
          productId: updated.id,
          catalogVersion: updated.catalogVersion,
          operation: 'UPSERT',
          name: updated.name,
          price: updated.price,
          sizes: updated.sizes,
          colors: updated.colors,
        })

        await tx.productOutboxEvent.create({
          data: {
            id: eventId,
            aggregateId: updated.id.toString(),
            aggregateVersion: updated.catalogVersion,
            operation: 'UPSERT',
            payload: event,
          },
        })
      })
    }

    scanned += products.length
    cursor = products.at(-1)?.id
  }

  console.log(`Catalog backfill scanned ${scanned} products`)
}

backfill()
  .catch((error) => {
    console.error('Catalog backfill failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
