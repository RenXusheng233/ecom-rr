import {
  catalogArchiveStateSchema,
  productDeletionPageSchema,
  type AdminProductType,
  type CatalogArchiveState,
  type ProductDeletionTask,
  type ProductDeletionStatus,
  type ProductDeletionStatusPage,
} from '@repo/types'

export function resolveDeletionStatus(
  task: ProductDeletionTask,
  state: CatalogArchiveState | undefined,
  available = true,
): ProductDeletionStatus {
  const result = (
    archiveStatus: ProductDeletionStatus['archiveStatus'],
    archiveError: string | null = null,
  ) => ({ ...task, archiveStatus, archiveError })
  if (!available)
    return result(
      'UNAVAILABLE',
      'The payment service status is temporarily unavailable.',
    )
  if (state && state.productId !== task.productId.toString())
    return result('UNAVAILABLE', 'The archive task could not be matched.')
  if (!state || state.desiredVersion < task.catalogVersion)
    return result('WAITING')
  if (
    state.desiredOperation !== 'ARCHIVE' ||
    state.desiredEventId !== task.taskId ||
    state.desiredVersion !== task.catalogVersion
  )
    return result(
      'UNAVAILABLE',
      'The catalog state does not match this archive task.',
    )
  if (state.status === 'FAILED')
    return result(
      'FAILED',
      state.lastError ?? 'The Stripe archive failed. Retry the task.',
    )
  if (state.status === 'SYNCED' && state.appliedVersion === task.catalogVersion)
    return result('ARCHIVED')
  return result(
    'PROCESSING',
    state.status !== 'SYNCED' && state.lastError
      ? `${state.lastError} The service is retrying automatically.`
      : null,
  )
}

export async function loadDeletionStatuses(
  options: {
    token: string
    cursor?: string
    productServiceUrl: string
    paymentServiceUrl: string
  },
  fetcher: typeof fetch = fetch,
): Promise<ProductDeletionStatusPage> {
  const headers = { Authorization: `Bearer ${options.token}` }
  const query = new URLSearchParams({ limit: '20' })
  if (options.cursor) query.set('cursor', options.cursor)
  const response = await fetcher(
    `${options.productServiceUrl}/products/admin/deletions?${query}`,
    {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    },
  )
  if (!response.ok) throw new Error('Could not load deletion tasks')
  const page = productDeletionPageSchema.parse(await response.json())
  if (page.tasks.length === 0) return { tasks: [], nextCursor: page.nextCursor }
  let states: CatalogArchiveState[] = []
  let available = true
  try {
    const stateResponse = await fetcher(
      `${options.paymentServiceUrl}/catalog-sync/archive-states`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productIds: [
            ...new Set(page.tasks.map((task) => task.productId.toString())),
          ],
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    )
    if (!stateResponse.ok) throw new Error('Payment status unavailable')
    states = catalogArchiveStateSchema
      .array()
      .max(50)
      .parse((await stateResponse.json()).items)
  } catch {
    available = false
  }
  const byProduct = new Map(states.map((state) => [state.productId, state]))
  return {
    tasks: page.tasks.map((task) =>
      resolveDeletionStatus(
        task,
        byProduct.get(task.productId.toString()),
        available,
      ),
    ),
    nextCursor: page.nextCursor,
  }
}

type DeletionTarget = Pick<AdminProductType, 'id' | 'name'>
export type ProductDeletionBatchResult = {
  deletedIds: number[]
  failures: Array<DeletionTarget & { error: string }>
}

export async function deleteProductBatch(
  products: DeletionTarget[],
  deleteProduct: (id: number) => Promise<void>,
): Promise<ProductDeletionBatchResult> {
  const result: ProductDeletionBatchResult = { deletedIds: [], failures: [] }
  for (let index = 0; index < products.length; index += 4) {
    const batch = products.slice(index, index + 4)
    const outcomes = await Promise.allSettled(
      batch.map((product) => deleteProduct(product.id)),
    )
    outcomes.forEach((outcome, offset) => {
      const product = batch[offset]!
      if (outcome.status === 'fulfilled') result.deletedIds.push(product.id)
      else
        result.failures.push({
          ...product,
          error:
            outcome.reason instanceof Error
              ? outcome.reason.message
              : 'Product could not be deleted',
        })
    })
  }
  return result
}
