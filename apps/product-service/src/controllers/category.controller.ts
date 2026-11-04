import { prisma, Prisma } from '@repo/product-db'
import { Request, Response } from 'express'
import { CategoryFormSchema } from '@repo/types'

export const createCategory = async (req: Request, res: Response) => {
  const data: Prisma.CategoryCreateInput = req.body

  const category = await prisma.category.create({ data })

  res.status(201).json(category)
}

export const updateCategory = async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid category ID' })
  }
  const parsed = CategoryFormSchema.safeParse(req.body)
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid category', issues: parsed.error.issues })
  }

  try {
    const category = await prisma.category.update({
      where: { id },
      data: parsed.data,
    })

    return res.status(200).json(category)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return res
          .status(409)
          .json({ error: 'A category with this slug already exists.' })
      }
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Category not found.' })
      }
    }
    throw error
  }
}

export const deleteCategory = async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid category ID' })
  }

  try {
    const category = await prisma.category.delete({ where: { id } })

    return res.status(200).json(category)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return res.status(409).json({
          error:
            'This category still has products. Move them to another category before deleting it.',
        })
      }
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Category not found.' })
      }
    }
    throw error
  }
}

export const getCategories = async (req: Request, res: Response) => {
  const categories = await prisma.category.findMany()

  res.status(200).json(categories)
}

export const getAdminCategories = async (req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    orderBy: { id: 'desc' },
    include: { _count: { select: { products: true } } },
  })

  res.status(200).json(
    categories.map(({ _count, ...category }) => ({
      ...category,
      productCount: _count.products,
    })),
  )
}
