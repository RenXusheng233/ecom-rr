import { Hono, type MiddlewareHandler } from 'hono'
import type { Prisma } from '@repo/payment-db'
import { checkoutRequestSchema, type CheckoutRequest } from '@repo/types'
import { shouldBeUser } from '../middleware/authMiddleware'
import {
  buildCheckoutSnapshot,
  CatalogSyncPendingError,
  InvalidCatalogOptionError,
  type CheckoutItemSnapshot,
} from '../utils/checkoutCatalog'
import {
  CheckoutCreationFailedError,
  CheckoutCreationRetryableError,
  IdempotencyKeyReusedError,
  buildStripeCheckoutSessionRequest,
  createOrResumeCheckout,
  type CheckoutAttemptRecord,
} from '../utils/checkoutSession'

type SessionVariables = { userId: string }

type SessionStatus = {
  paymentAttemptId: string
  orderId: string
  paymentStatus: string
  refundStatus: string
  disputeStatus: string
  orderStatus: 'NOT_CREATED' | 'PENDING' | 'CONFIRMED'
  amountTotal: number
  currency: 'usd'
}

type SessionRouteDependencies = {
  createCheckout(input: {
    userId: string
    clientRequestId: string
    request: CheckoutRequest
  }): Promise<{
    checkoutSessionClientSecret: string
    paymentAttemptId: string
    orderId: string
  }>
  findSessionStatus(
    stripeCheckoutSessionId: string,
    userId: string,
  ): Promise<SessionStatus | null>
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const errorResponse = (code: string, message?: string) => ({
  error: { code, ...(message ? { message } : {}) },
})

export const createSessionRoute = (
  dependencies: SessionRouteDependencies,
  authMiddleware: MiddlewareHandler<{
    Variables: SessionVariables
  }> = shouldBeUser,
) => {
  const route = new Hono<{ Variables: SessionVariables }>()
  route.use('*', authMiddleware)

  route.post('/create-checkout-session', async (context) => {
    const clientRequestId = context.req.header('Idempotency-Key')
    if (!clientRequestId || !UUID_PATTERN.test(clientRequestId)) {
      return context.json(errorResponse('IDEMPOTENCY_KEY_REQUIRED'), 400)
    }

    let body: unknown
    try {
      body = await context.req.json()
    } catch {
      return context.json(errorResponse('INVALID_CHECKOUT_REQUEST'), 400)
    }
    const parsed = checkoutRequestSchema.safeParse(body)
    if (!parsed.success) {
      return context.json(errorResponse('INVALID_CHECKOUT_REQUEST'), 400)
    }

    try {
      return context.json(
        await dependencies.createCheckout({
          userId: context.get('userId'),
          clientRequestId,
          request: parsed.data,
        }),
      )
    } catch (error) {
      if (error instanceof IdempotencyKeyReusedError) {
        return context.json(errorResponse(error.code, error.message), 409)
      }
      if (error instanceof CatalogSyncPendingError) {
        return context.json(errorResponse(error.code, error.message), 409)
      }
      if (error instanceof InvalidCatalogOptionError) {
        return context.json(errorResponse(error.code, error.message), 400)
      }
      if (error instanceof CheckoutCreationRetryableError) {
        return context.json(errorResponse(error.code), 503)
      }
      if (error instanceof CheckoutCreationFailedError) {
        return context.json(errorResponse(error.code), 422)
      }
      console.error('Checkout Session creation failed', error)
      return context.json(errorResponse('CHECKOUT_SESSION_FAILED'), 500)
    }
  })

  route.get('/:session_id', async (context) => {
    try {
      const status = await dependencies.findSessionStatus(
        context.req.param('session_id'),
        context.get('userId'),
      )
      return status
        ? context.json(status)
        : context.json(errorResponse('CHECKOUT_SESSION_NOT_FOUND'), 404)
    } catch (error) {
      console.error('Checkout Session lookup failed', error)
      return context.json(errorResponse('CHECKOUT_SESSION_LOOKUP_FAILED'), 500)
    }
  })

  return route
}

const toAttemptRecord = (attempt: {
  id: string
  orderId: string
  userId: string
  clientRequestId: string
  requestHash: string
  amountTotal: number
  currency: string
  itemsSnapshot: Prisma.JsonValue
  stripeCheckoutSessionId: string | null
  stripeClientSecret: string | null
}): CheckoutAttemptRecord => ({
  ...attempt,
  currency: 'usd',
  itemsSnapshot: attempt.itemsSnapshot as CheckoutItemSnapshot[],
})

const realDependencies: SessionRouteDependencies = {
  createCheckout: async (input) => {
    const [{ paymentPrisma }, { default: stripe }] = await Promise.all([
      import('@repo/payment-db'),
      import('../utils/stripe'),
    ])
    return createOrResumeCheckout(
      {
        ...input,
        clientAppUrl: process.env.CLIENT_APP_URL ?? 'http://localhost:3000',
      },
      {
        resolveCatalog: async (request) => {
          const catalogItems = await paymentPrisma.stripeCatalogItem.findMany({
            where: {
              productId: {
                in: [...new Set(request.cart.map((item) => item.productId))],
              },
            },
          })
          return buildCheckoutSnapshot(request.cart, catalogItems)
        },
        findAttempt: async (userId, clientRequestId) => {
          const attempt = await paymentPrisma.checkoutAttempt.findUnique({
            where: { userId_clientRequestId: { userId, clientRequestId } },
          })
          return attempt ? toAttemptRecord(attempt) : null
        },
        createAttempt: async (attempt) => {
          try {
            return toAttemptRecord(
              await paymentPrisma.checkoutAttempt.create({
                data: {
                  ...attempt,
                  itemsSnapshot:
                    attempt.itemsSnapshot as unknown as Prisma.InputJsonValue,
                },
              }),
            )
          } catch (error) {
            if (
              typeof error !== 'object' ||
              !error ||
              !('code' in error) ||
              error.code !== 'P2002'
            ) {
              throw error
            }
            const existing = await paymentPrisma.checkoutAttempt.findUnique({
              where: {
                userId_clientRequestId: {
                  userId: attempt.userId,
                  clientRequestId: attempt.clientRequestId,
                },
              },
            })
            if (!existing) throw error
            return toAttemptRecord(existing)
          }
        },
        confirmSession: async (session) => {
          await paymentPrisma.$transaction(async (tx) => {
            await tx.$queryRaw`
              SELECT "id"
              FROM "CheckoutAttempt"
              WHERE "id" = ${session.attemptId}
              FOR UPDATE
            `
            const current = await tx.checkoutAttempt.findUnique({
              where: { id: session.attemptId },
            })
            if (!current) throw new Error('Checkout attempt no longer exists')
            if (
              current.stripeCheckoutSessionId &&
              current.stripeCheckoutSessionId !==
                session.stripeCheckoutSessionId
            ) {
              throw new Error('Checkout attempt has another Stripe session')
            }

            await tx.checkoutAttempt.update({
              where: { id: session.attemptId },
              data: {
                paymentStatus:
                  current.paymentStatus === 'CREATING' ||
                  current.paymentStatus === 'FAILED'
                    ? 'OPEN'
                    : current.paymentStatus,
                stripeCheckoutSessionId: session.stripeCheckoutSessionId,
                stripeClientSecret: session.stripeClientSecret,
                lastError: null,
              },
            })
          })
        },
        failAttempt: async ({ attemptId, error }) => {
          await paymentPrisma.checkoutAttempt.updateMany({
            where: { id: attemptId, paymentStatus: 'CREATING' },
            data: {
              paymentStatus: 'FAILED',
              lastError: error.slice(0, 1000),
            },
          })
        },
        createStripeSession: async (sessionInput, idempotencyKey) => {
          const session = await stripe.checkout.sessions.create(
            buildStripeCheckoutSessionRequest(sessionInput),
            { idempotencyKey },
          )
          if (!session.client_secret) {
            throw new Error('Stripe Checkout Session has no client secret')
          }
          return { id: session.id, clientSecret: session.client_secret }
        },
      },
    )
  },
  findSessionStatus: async (stripeCheckoutSessionId, userId) => {
    const { paymentPrisma } = await import('@repo/payment-db')
    const attempt = await paymentPrisma.checkoutAttempt.findFirst({
      where: { stripeCheckoutSessionId, userId },
    })
    if (!attempt) return null

    const orderStatus =
      attempt.paymentStatus === 'SUCCEEDED'
        ? attempt.orderExists && attempt.orderAppliedVersion === attempt.version
          ? 'CONFIRMED'
          : 'PENDING'
        : 'NOT_CREATED'
    return {
      paymentAttemptId: attempt.id,
      orderId: attempt.orderId,
      paymentStatus: attempt.paymentStatus,
      refundStatus: attempt.refundStatus,
      disputeStatus: attempt.disputeStatus,
      orderStatus,
      amountTotal: attempt.amountTotal,
      currency: 'usd',
    }
  },
}

export default createSessionRoute(realDependencies)
