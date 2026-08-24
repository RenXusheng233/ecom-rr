type StripeLikeError = {
  type?: string
  statusCode?: number
}

export type CatalogRetryDecision = {
  retry: boolean
  nextAttemptAt: Date | null
}

const isRetryable = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const stripeError = error as StripeLikeError
  return (
    stripeError.statusCode === 429 ||
    (stripeError.statusCode !== undefined && stripeError.statusCode >= 500) ||
    stripeError.type === 'StripeConnectionError' ||
    stripeError.type === 'StripeAPIError' ||
    stripeError.type === 'StripeRateLimitError'
  )
}

export const getCatalogRetryDecision = (
  error: unknown,
  attempt: number,
  now = new Date(),
  random = Math.random(),
): CatalogRetryDecision => {
  if (!isRetryable(error) || attempt >= 8) {
    return { retry: false, nextAttemptAt: null }
  }

  const baseDelay = Math.min(5000 * 2 ** Math.max(0, attempt - 1), 1800000)
  const jitter = Math.floor(baseDelay * 0.2 * random)

  return {
    retry: true,
    nextAttemptAt: new Date(now.getTime() + baseDelay + jitter),
  }
}

export const shouldRotateSyncRunAfterFailure = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const statusCode = (error as StripeLikeError).statusCode
  return statusCode !== undefined && statusCode >= 500
}
