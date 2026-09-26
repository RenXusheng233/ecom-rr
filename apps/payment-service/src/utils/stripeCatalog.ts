import Stripe from 'stripe'
import stripe from './stripe'
import type { StripeCatalogState } from './catalogDrift'
import {
  activePriceIdsToArchive,
  needsNewStripePrice,
} from './stripeCatalogPolicy'

const MANAGED_BY = 'ecom-rr-payment-service'

type CatalogItemInput = {
  productId: string
  desiredVersion: number
  desiredName: string | null
  desiredUnitAmount: number | null
  desiredCurrency: string | null
  syncRunId: string
  assertClaimActive?: () => Promise<void>
}

const isMissingResource = (error: unknown) =>
  error instanceof Stripe.errors.StripeInvalidRequestError &&
  error.statusCode === 404

const metadataFor = (catalogVersion: number, syncRunId: string) => ({
  managed_by: MANAGED_BY,
  catalog_version: catalogVersion.toString(),
  sync_run_id: syncRunId,
})

const retrieveProduct = async (productId: string) => {
  try {
    return await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    })
  } catch (error) {
    if (isMissingResource(error)) return null
    throw error
  }
}

const defaultPriceFrom = (product: Stripe.Product) =>
  product.default_price && typeof product.default_price !== 'string'
    ? product.default_price
    : null

const catalogVersionFrom = (product: Stripe.Product) => {
  const version = Number(product.metadata.catalog_version)
  return Number.isSafeInteger(version) ? version : null
}

const listActivePrices = async (productId: string) => {
  const prices: Stripe.Price[] = []
  for await (const price of stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  })) {
    prices.push(price)
  }
  return prices
}

export const upsertStripeCatalogItem = async (item: CatalogItemInput) => {
  if (
    !item.desiredName ||
    item.desiredUnitAmount === null ||
    item.desiredCurrency !== 'usd'
  ) {
    throw new Error(`Incomplete desired catalog state for ${item.productId}`)
  }
  const desiredUnitAmount = item.desiredUnitAmount

  let product = await retrieveProduct(item.productId)
  if (!product) {
    await item.assertClaimActive?.()
    product = await stripe.products.create(
      {
        id: item.productId,
        name: item.desiredName,
        active: true,
        metadata: metadataFor(item.desiredVersion, item.syncRunId),
      },
      {
        idempotencyKey: `catalog:${item.productId}:v${item.desiredVersion}:upsert:${item.syncRunId}:product:create`,
      },
    )
  }

  const oldDefaultPrice = defaultPriceFrom(product)
  let currentPrice = oldDefaultPrice
  if (
    needsNewStripePrice(
      currentPrice
        ? {
            active: currentPrice.active,
            currency: currentPrice.currency,
            unitAmount: currentPrice.unit_amount,
          }
        : null,
      desiredUnitAmount,
    )
  ) {
    const activePrices = await listActivePrices(item.productId)
    currentPrice =
      activePrices.find(
        (price) =>
          price.currency === 'usd' &&
          price.unit_amount === desiredUnitAmount &&
          Number(price.metadata.catalog_version) === item.desiredVersion,
      ) ??
      (await (async () => {
        await item.assertClaimActive?.()
        return stripe.prices.create(
          {
            product: item.productId,
            currency: 'usd',
            unit_amount: desiredUnitAmount,
            metadata: metadataFor(item.desiredVersion, item.syncRunId),
          },
          {
            idempotencyKey: `catalog:${item.productId}:v${item.desiredVersion}:upsert:${item.syncRunId}:price:create`,
          },
        )
      })())
  }
  if (!currentPrice) {
    throw new Error(`Stripe Price creation failed for ${item.productId}`)
  }

  await item.assertClaimActive?.()
  await stripe.products.update(
    item.productId,
    {
      name: item.desiredName,
      active: true,
      default_price: currentPrice.id,
      metadata: metadataFor(item.desiredVersion, item.syncRunId),
    },
    {
      idempotencyKey: `catalog:${item.productId}:v${item.desiredVersion}:upsert:${item.syncRunId}:product:update`,
    },
  )

  const activePrices = await listActivePrices(item.productId)
  for (const priceId of activePriceIdsToArchive(
    activePrices,
    currentPrice.id,
  )) {
    await item.assertClaimActive?.()
    await stripe.prices.update(
      priceId,
      { active: false },
      {
        idempotencyKey: `catalog:${item.productId}:v${item.desiredVersion}:upsert:${item.syncRunId}:price:${priceId}:archive`,
      },
    )
  }

  return {
    stripeProductId: item.productId,
    stripePriceId: currentPrice.id,
  }
}

export const archiveStripeCatalogItem = async (
  productId: string,
  catalogVersion: number,
  syncRunId: string,
  assertClaimActive?: () => Promise<void>,
) => {
  const product = await retrieveProduct(productId)
  if (!product) {
    return { stripeProductId: productId, stripePriceId: null }
  }
  const activePrices = await listActivePrices(productId)
  for (const price of activePrices) {
    await assertClaimActive?.()
    await stripe.prices.update(
      price.id,
      { active: false },
      {
        idempotencyKey: `catalog:${productId}:v${catalogVersion}:archive:${syncRunId}:price:${price.id}:archive`,
      },
    )
  }

  await assertClaimActive?.()
  await stripe.products.update(
    productId,
    {
      active: false,
      metadata: metadataFor(catalogVersion, syncRunId),
    },
    {
      idempotencyKey: `catalog:${productId}:v${catalogVersion}:archive:${syncRunId}:product:archive`,
    },
  )

  return { stripeProductId: productId, stripePriceId: null }
}

export const inspectStripeCatalogItem = async (
  productId: string,
): Promise<StripeCatalogState> => {
  const product = await retrieveProduct(productId)
  if (!product) {
    return {
      exists: false,
      active: false,
      defaultPriceActive: false,
      defaultPriceId: null,
      activePriceCount: 0,
      name: null,
      unitAmount: null,
      catalogVersion: null,
    }
  }

  const defaultPrice = defaultPriceFrom(product)
  const activePrices = await listActivePrices(productId)
  const catalogVersion = Number(product.metadata.catalog_version)
  return {
    exists: true,
    active: product.active,
    defaultPriceActive: defaultPrice?.active ?? false,
    defaultPriceId: defaultPrice?.id ?? null,
    activePriceCount: activePrices.length,
    name: product.name,
    unitAmount: defaultPrice?.unit_amount ?? null,
    catalogVersion: Number.isSafeInteger(catalogVersion)
      ? catalogVersion
      : null,
  }
}

export const listStripeCatalogProducts = async () => {
  const products: Stripe.Product[] = []
  for await (const product of stripe.products.list({ limit: 100 })) {
    products.push(product)
  }
  return products.map((product) => ({
    productId: product.id,
    managed: product.metadata.managed_by === MANAGED_BY,
    active: product.active,
    catalogVersion: Number(product.metadata.catalog_version) || 1,
  }))
}
