import { randomUUID } from 'node:crypto'
import { prisma } from '@repo/product-db'
import { createCatalogSyncRequestedEvent } from '../utils/catalogSync'

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
      const eventId = randomUUID()
      const event = createCatalogSyncRequestedEvent({
        eventId,
        occurredAt: new Date(),
        productId: product.id,
        catalogVersion: product.catalogVersion,
        operation: 'UPSERT',
        name: product.name,
        price: product.price,
      })

      await prisma.productOutboxEvent.upsert({
        where: {
          aggregateId_aggregateVersion_operation: {
            aggregateId: product.id.toString(),
            aggregateVersion: product.catalogVersion,
            operation: 'UPSERT',
          },
        },
        create: {
          id: eventId,
          aggregateId: product.id.toString(),
          aggregateVersion: product.catalogVersion,
          operation: 'UPSERT',
          payload: event,
        },
        update: {},
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
