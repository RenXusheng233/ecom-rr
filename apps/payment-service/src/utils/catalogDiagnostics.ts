export const archiveErrorSummary = (message: string | null) => {
  if (!message) return null
  if (/default.{0,70}price|price.{0,70}default/i.test(message)) {
    return 'Stripe rejected archiving the default price. The default price must be cleared before archiving it.'
  }
  if (/api key|authentication|unauthorized/i.test(message)) {
    return 'Stripe authentication failed. Check the payment service configuration.'
  }
  if (/rate limit|429/i.test(message))
    return 'Stripe rate limit reached. Retry the archive later.'
  if (/connect|network|timeout|timed out/i.test(message))
    return 'The payment service could not reach Stripe.'
  return 'Stripe catalog synchronization failed. Use the task and request IDs in the payment service log for details.'
}

export function catalogFailureDetails(error: unknown) {
  const source =
    error && typeof error === 'object'
      ? (error as {
          type?: unknown
          code?: unknown
          statusCode?: unknown
          requestId?: unknown
          param?: unknown
          message?: unknown
        })
      : {}
  const code =
    typeof source.code === 'string' &&
    /^[a-z][a-z_]{0,63}$/.test(source.code) &&
    !/^(?:sk_|rk_|pk_|whsec_)/.test(source.code)
      ? source.code
      : undefined
  const types = [
    'StripeCardError',
    'StripeInvalidRequestError',
    'StripeAPIError',
    'StripeAuthenticationError',
    'StripePermissionError',
    'StripeRateLimitError',
    'StripeConnectionError',
    'StripeIdempotencyError',
  ]
  const params = [
    'active',
    'default_price',
    'product',
    'price',
    'metadata',
    'currency',
    'unit_amount',
    'idempotency_key',
  ]
  return {
    errorType:
      typeof source.type === 'string' && types.includes(source.type)
        ? source.type
        : 'UnknownError',
    code,
    statusCode:
      typeof source.statusCode === 'number' &&
      source.statusCode >= 400 &&
      source.statusCode <= 599
        ? source.statusCode
        : undefined,
    requestId:
      typeof source.requestId === 'string' &&
      /^req_[A-Za-z0-9]{1,100}$/.test(source.requestId)
        ? source.requestId
        : undefined,
    param:
      typeof source.param === 'string' && params.includes(source.param)
        ? source.param
        : undefined,
    summary:
      archiveErrorSummary(
        typeof source.message === 'string' ? source.message : null,
      ) ?? 'Catalog synchronization failed without Stripe error details.',
  }
}
