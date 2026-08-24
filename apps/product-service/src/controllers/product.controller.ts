import { Request, Response } from 'express'
import { prisma, Prisma } from '@repo/product-db'
import { randomUUID } from 'node:crypto'
import { createCatalogSyncRequestedEvent } from '../utils/catalogSync'

const createOutboxEvent = async (
  tx: Prisma.TransactionClient,
  product: { id: number; name: string; price: number; catalogVersion: number },
  operation: 'UPSERT' | 'ARCHIVE',
) => {
  const eventId = randomUUID()
  const event = createCatalogSyncRequestedEvent({
    eventId,
    occurredAt: new Date(),
    productId: product.id,
    catalogVersion: product.catalogVersion,
    operation,
    name: product.name,
    price: product.price,
  })

  await tx.productOutboxEvent.create({
    data: {
      id: eventId,
      aggregateId: product.id.toString(),
      aggregateVersion: product.catalogVersion,
      operation,
      payload: event,
    },
  })
}

export const createProduct = async (req: Request, res: Response) => {
  const data: Prisma.ProductCreateInput = req.body

  const { colors, images } = data
  if (!colors || !Array.isArray(colors) || colors.length === 0) {
    return res.status(400).json({ error: 'Colors array is required!' })
  }
  if (!images || typeof images !== 'object') {
    return res.status(400).json({ error: 'Images object is required' })
  }
  const missingColors = (colors as string[]).filter(
    (color) => !(color in images),
  )
  if (missingColors.length > 0) {
    return res
      .status(400)
      .json({ error: 'Missing images for colors!', missingColors })
  }

  const product = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        ...data,
        catalogVersion: 1,
        stripeSyncStatus: 'PENDING',
        stripeSyncedVersion: null,
        stripeSyncedAt: null,
        stripeSyncError: null,
        stripeSyncResultRevision: 0,
      },
    })

    await createOutboxEvent(tx, createdProduct, 'UPSERT')
    return createdProduct
  })

  res.status(201).json(product)
}

export const updateProduct = async (req: Request, res: Response) => {
  const { id } = req.params
  const productId = Number(id)
  const data: Prisma.ProductUpdateInput = req.body

  const updatedProduct = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Product"
      WHERE "id" = ${productId}
      FOR UPDATE
    `
    const current = await tx.product.findUniqueOrThrow({
      where: { id: productId },
      select: {
        stripeSyncedVersion: true,
        stripeSyncResultRevision: true,
      },
    })
    const product = await tx.product.update({
      where: { id: productId },
      data: {
        ...data,
        catalogVersion: { increment: 1 },
        stripeSyncStatus: 'PENDING',
        stripeSyncedVersion: current.stripeSyncedVersion,
        stripeSyncedAt: null,
        stripeSyncError: null,
        stripeSyncResultRevision: current.stripeSyncResultRevision,
      },
    })

    await createOutboxEvent(tx, product, 'UPSERT')
    return product
  })

  res.status(200).json(updatedProduct)
}

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params
  const productId = Number(id)

  const deletedProduct = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Product"
      WHERE "id" = ${productId}
      FOR UPDATE
    `
    const product = await tx.product.findUniqueOrThrow({
      where: { id: productId },
    })
    const archiveVersion = product.catalogVersion + 1

    await tx.product.delete({ where: { id: product.id } })
    await createOutboxEvent(
      tx,
      { ...product, catalogVersion: archiveVersion },
      'ARCHIVE',
    )

    return product
  })

  res.status(200).json(deletedProduct)
}

export const getProducts = async (req: Request, res: Response) => {
  const { sort, category, search, limit } = req.query

  const orderBy = (() => {
    switch (sort) {
      case 'asc':
        return { price: Prisma.SortOrder.asc }
      case 'desc':
        return { price: Prisma.SortOrder.desc }
      case 'oldest':
        return { createdAt: Prisma.SortOrder.asc }
      default:
        return { createdAt: Prisma.SortOrder.desc }
    }
  })()

  const products = await prisma.product.findMany({
    where: {
      ...(process.env.CATALOG_SYNC_ENFORCEMENT === 'true'
        ? { stripeSyncStatus: 'SYNCED' as const }
        : {}),
      category: {
        slug: category as string,
      },
      name: {
        contains: search as string,
        mode: 'insensitive',
      },
    },
    orderBy,
    take: limit ? Number(limit) : undefined,
  })

  res
    .status(200)
    .json(
      process.env.CATALOG_SYNC_ENFORCEMENT === 'true'
        ? products.filter(
            (product) => product.stripeSyncedVersion === product.catalogVersion,
          )
        : products,
    )
}

export const getProduct = async (req: Request, res: Response) => {
  const { id } = req.params

  const product = await prisma.product.findUnique({
    where: {
      id: Number(id),
      ...(process.env.CATALOG_SYNC_ENFORCEMENT === 'true'
        ? { stripeSyncStatus: 'SYNCED' as const }
        : {}),
    },
  })

  const isVersionSynced =
    product && product.stripeSyncedVersion === product.catalogVersion
  res
    .status(200)
    .json(
      process.env.CATALOG_SYNC_ENFORCEMENT === 'true' && !isVersionSynced
        ? null
        : product,
    )
}

export const getAdminProducts = async (req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
  })

  res.status(200).json(products)
}
