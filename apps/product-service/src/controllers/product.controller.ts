import { Request, Response } from 'express'
import { prisma, Prisma, type ProductOutboxEvent } from '@repo/product-db'
import { randomUUID } from 'node:crypto'
import {
  ProductFormSchema,
  ProductUpdateSchema,
  type ProductDeletionTask,
} from '@repo/types'
import { createCatalogSyncRequestedEvent } from '../utils/catalogSync'

const createOutboxEvent = async (
  tx: Prisma.TransactionClient,
  product: {
    id: number
    name: string
    price: number
    sizes: string[]
    colors: string[]
    catalogVersion: number
  },
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
    sizes: product.sizes,
    colors: product.colors,
  })

  return tx.productOutboxEvent.create({
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
  const parsed = ProductFormSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid product', issues: parsed.error.issues })
  }

  const product = await prisma.$transaction(async (tx) => {
    const createdProduct = await tx.product.create({
      data: {
        ...parsed.data,
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
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ error: 'Invalid product ID' })
  }
  const parsed = ProductUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid product', issues: parsed.error.issues })
  }

  const updatedProduct = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "Product"
      WHERE "id" = ${productId}
      FOR UPDATE
    `
    const current = await tx.product.findUnique({ where: { id: productId } })
    if (!current) return null
    const validated = ProductFormSchema.safeParse({
      name: current.name,
      shortDescription: current.shortDescription,
      description: current.description,
      price: current.price,
      categorySlug: current.categorySlug,
      colors: current.colors,
      sizes: current.sizes,
      images: current.images,
      ...parsed.data,
    })
    if (!validated.success) return { validationError: validated.error.issues }
    const product = await tx.product.update({
      where: { id: productId },
      data: {
        ...parsed.data,
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

  if (!updatedProduct)
    return res.status(404).json({ error: 'Product not found' })
  if ('validationError' in updatedProduct) {
    return res.status(400).json({
      error: 'Invalid product',
      issues: updatedProduct.validationError,
    })
  }
  res.status(200).json(updatedProduct)
}

export const deleteProduct = async (req: Request, res: Response) => {
  const { id } = req.params
  const productId = Number(id)
  if (
    !Number.isSafeInteger(productId) ||
    productId < 1 ||
    productId > 2147483647
  ) {
    return res.status(400).json({ error: 'Invalid product ID' })
  }

  try {
    const deletedProduct = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
      SELECT "id"
      FROM "Product"
      WHERE "id" = ${productId}
      FOR UPDATE
    `
      const product = await tx.product.findUnique({
        where: { id: productId },
      })
      if (!product) {
        const previous = await tx.productOutboxEvent.findFirst({
          where: { aggregateId: productId.toString(), operation: 'ARCHIVE' },
          orderBy: { aggregateVersion: 'desc' },
        })
        return previous
          ? { id: productId, deletionTask: deletionTaskFromEvent(previous) }
          : null
      }
      const archiveVersion = product.catalogVersion + 1

      await tx.product.delete({ where: { id: product.id } })
      const archive = await createOutboxEvent(
        tx,
        { ...product, catalogVersion: archiveVersion },
        'ARCHIVE',
      )

      return { ...product, deletionTask: deletionTaskFromEvent(archive) }
    })

    if (!deletedProduct)
      return res.status(404).json({ error: 'Product not found' })
    return res.status(200).json(deletedProduct)
  } catch {
    return res.status(503).json({
      error:
        'Product deletion could not be completed. Please retry the request.',
    })
  }
}

const deletionTaskFromEvent = (
  event: Pick<
    ProductOutboxEvent,
    | 'id'
    | 'aggregateId'
    | 'aggregateVersion'
    | 'createdAt'
    | 'status'
    | 'lastError'
  >,
): ProductDeletionTask => ({
  taskId: event.id,
  productId: Number(event.aggregateId),
  catalogVersion: event.aggregateVersion,
  deletedAt: event.createdAt.toISOString(),
  dispatchStatus: event.status,
  dispatchError: event.lastError
    ? 'The archive request could not be published. The service will retry automatically.'
    : null,
})

export const getProductDeletions = async (req: Request, res: Response) => {
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit)
  const cursor = req.query.cursor
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (cursor !== undefined &&
      (typeof cursor !== 'string' || !cursor || cursor.length > 200))
  ) {
    return res.status(400).json({ error: 'Invalid deletion page' })
  }
  try {
    const events = await prisma.productOutboxEvent.findMany({
      where: { operation: 'ARCHIVE' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    return res.status(200).json({
      tasks: events.slice(0, limit).map(deletionTaskFromEvent),
      nextCursor: events.length > limit ? events[limit - 1]!.id : null,
    })
  } catch {
    return res
      .status(503)
      .json({ error: 'Deletion tasks could not be loaded. Please try again.' })
  }
}

export const getProducts = async (req: Request, res: Response) => {
  const { sort, category, search, limit } = req.query
  const parsedLimit = limit === undefined ? undefined : Number(limit)
  if (
    parsedLimit !== undefined &&
    (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1)
  ) {
    return res.status(400).json({ error: 'Invalid limit' })
  }

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
        ? {
            stripeSyncStatus: 'SYNCED' as const,
            stripeSyncedVersion: {
              equals: prisma.product.fields.catalogVersion,
            },
          }
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
    take: parsedLimit,
  })

  res.status(200).json(products)
}

export const getProduct = async (req: Request, res: Response) => {
  const { id } = req.params
  const productId = Number(id)
  if (!Number.isSafeInteger(productId) || productId < 1) {
    return res.status(400).json({ error: 'Invalid product ID' })
  }

  const product = await prisma.product.findUnique({
    where: {
      id: productId,
      ...(process.env.CATALOG_SYNC_ENFORCEMENT === 'true'
        ? { stripeSyncStatus: 'SYNCED' as const }
        : {}),
    },
  })

  const isVersionSynced =
    product && product.stripeSyncedVersion === product.catalogVersion
  if (
    !product ||
    (process.env.CATALOG_SYNC_ENFORCEMENT === 'true' && !isVersionSynced)
  ) {
    return res.status(404).json({ error: 'Product not found' })
  }
  res.status(200).json(product)
}

export const getAdminProducts = async (req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'desc' },
    include: { category: { select: { id: true, name: true, slug: true } } },
  })

  res.status(200).json(products)
}
