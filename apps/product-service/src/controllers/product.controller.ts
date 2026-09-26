import { Request, Response } from 'express'
import { prisma, Prisma } from '@repo/product-db'
import { randomUUID } from 'node:crypto'
import { ProductFormSchema, ProductUpdateSchema } from '@repo/types'
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
  })

  res.status(200).json(products)
}
