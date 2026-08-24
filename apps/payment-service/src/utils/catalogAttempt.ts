type CatalogSyncAttemptDependencies<T> = {
  runStripeOperation: () => Promise<T>
  persistSuccess: (result: T) => Promise<void>
  handleStripeFailure: (error: unknown) => Promise<void>
}

export const executeCatalogSyncAttempt = async <T>({
  runStripeOperation,
  persistSuccess,
  handleStripeFailure,
}: CatalogSyncAttemptDependencies<T>) => {
  let result: T
  try {
    result = await runStripeOperation()
  } catch (error) {
    await handleStripeFailure(error)
    return
  }

  await persistSuccess(result)
}
