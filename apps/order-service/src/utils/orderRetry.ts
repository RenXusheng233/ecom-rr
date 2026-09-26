export const orderRetryAt = (
  attempt: number,
  now = new Date(),
  random = Math.random(),
) => {
  const delay = Math.min(5000 * 2 ** Math.max(0, attempt - 1), 30 * 60 * 1000)
  return new Date(now.getTime() + delay + Math.floor(delay * 0.2 * random))
}
