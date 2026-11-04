import { z } from 'zod'

const productIdSchema = z.number().int().min(1).max(2147483647)
const taskIdSchema = z.string().min(1).max(200)

export const archiveTaskIdentitySchema = z.object({
  productId: productIdSchema,
  taskId: taskIdSchema,
  catalogVersion: z.number().int().min(1).max(2147483647),
})
export type ArchiveTaskIdentity = z.infer<typeof archiveTaskIdentitySchema>

export const catalogArchiveBatchSchema = z.object({
  productIds: z
    .array(
      z
        .string()
        .regex(/^[1-9]\d{0,9}$/)
        .refine((id) => Number(id) <= 2147483647),
    )
    .min(1)
    .max(50),
})

export const productDeletionTaskSchema = archiveTaskIdentitySchema.extend({
  deletedAt: z.iso.datetime(),
  dispatchStatus: z.enum(['PENDING', 'PUBLISHED']),
  dispatchError: z.string().nullable(),
})
export type ProductDeletionTask = z.infer<typeof productDeletionTaskSchema>

export const productDeletionPageSchema = z.object({
  tasks: z.array(productDeletionTaskSchema).max(50),
  nextCursor: taskIdSchema.nullable(),
})
export type ProductDeletionPage = z.infer<typeof productDeletionPageSchema>

export const catalogArchiveStateSchema = z.object({
  productId: z.string(),
  desiredEventId: z.string(),
  desiredVersion: z.number().int(),
  desiredOperation: z.enum(['UPSERT', 'ARCHIVE']),
  appliedVersion: z.number().int().nullable(),
  status: z.enum(['PENDING', 'PROCESSING', 'SYNCED', 'FAILED']),
  lastError: z.string().nullable(),
})
export type CatalogArchiveState = z.infer<typeof catalogArchiveStateSchema>

export type ProductDeletionStatus = ProductDeletionTask & {
  archiveStatus:
    | 'WAITING'
    | 'PROCESSING'
    | 'ARCHIVED'
    | 'FAILED'
    | 'UNAVAILABLE'
  archiveError: string | null
}
export type ProductDeletionStatusPage = {
  tasks: ProductDeletionStatus[]
  nextCursor: string | null
}
