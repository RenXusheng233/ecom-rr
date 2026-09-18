type StripeLikeError = {
  permanent?: boolean
  statusCode?: number
  type?: string
}

export type PaymentRetryDecision = {
  retry: boolean
  nextAttemptAt: Date | null
}

const isRetryable = (error: unknown) => {
  if (!error || typeof error !== 'object') return true
  const candidate = error as StripeLikeError
  if (candidate.permanent) return false
  if (
    candidate.statusCode !== undefined &&
    candidate.statusCode >= 400 &&
    candidate.statusCode < 500 &&
    candidate.statusCode !== 429
  ) {
    return false
  }
  return true
}

export const getPaymentRetryDecision = (
  error: unknown,
  attempt: number,
  now = new Date(),
  random = Math.random(),
): PaymentRetryDecision => {
  if (!isRetryable(error) || attempt >= 8) {
    return { retry: false, nextAttemptAt: null }
  }

  const baseDelay = Math.min(
    5000 * 2 ** Math.max(0, attempt - 1),
    30 * 60 * 1000,
  )
  const jitter = Math.floor(baseDelay * 0.2 * random)
  return {
    retry: true,
    nextAttemptAt: new Date(now.getTime() + baseDelay + jitter),
  }
}
