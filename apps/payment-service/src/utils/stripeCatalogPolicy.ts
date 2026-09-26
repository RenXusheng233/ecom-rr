type StripePriceState = {
  active: boolean
  currency: string
  unitAmount: number | null
}

export const needsNewStripePrice = (
  currentPrice: StripePriceState | null,
  desiredUnitAmount: number,
) =>
  !currentPrice ||
  !currentPrice.active ||
  currentPrice.currency !== 'usd' ||
  currentPrice.unitAmount !== desiredUnitAmount

export const activePriceIdsToArchive = (
  prices: { id: string; active: boolean }[],
  selectedPriceId: string,
) =>
  prices
    .filter((price) => price.active && price.id !== selectedPriceId)
    .map((price) => price.id)
