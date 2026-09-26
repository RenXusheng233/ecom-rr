import { paymentPrisma } from '@repo/payment-db'
import type { OrderPaymentAppliedEvent } from '@repo/types'

export const nextOrderProjection = (
  currentVersion: number | null,
  appliedVersion: number,
  orderExists: boolean,
  paymentVersion: number,
) =>
  appliedVersion > paymentVersion ||
  (currentVersion !== null && appliedVersion <= currentVersion)
    ? ({ advance: false } as const)
    : ({
        advance: true,
        orderAppliedVersion: appliedVersion,
        orderExists,
      } as const)

const isUniqueViolation = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'P2002'

export const persistOrderProjectionAck = async (
  event: OrderPaymentAppliedEvent,
) => {
  try {
    await paymentPrisma.$transaction(async (tx) => {
      const existing = await tx.orderProjectionInboxEvent.findUnique({
        where: { id: event.id },
      })
      if (existing) return

      await tx.orderProjectionInboxEvent.create({
        data: {
          id: event.id,
          orderId: event.data.orderId,
          paymentAttemptId: event.data.paymentAttemptId,
          appliedVersion: event.data.appliedVersion,
        },
      })

      const attempt = await tx.checkoutAttempt.findUnique({
        where: { id: event.data.paymentAttemptId },
        select: { orderId: true, orderAppliedVersion: true, version: true },
      })
      if (!attempt || attempt.orderId !== event.data.orderId) return

      const projection = nextOrderProjection(
        attempt.orderAppliedVersion,
        event.data.appliedVersion,
        event.data.orderExists,
        attempt.version,
      )
      if (!projection.advance) return

      await tx.checkoutAttempt.updateMany({
        where: {
          id: event.data.paymentAttemptId,
          orderId: event.data.orderId,
          OR: [
            { orderAppliedVersion: null },
            { orderAppliedVersion: { lt: event.data.appliedVersion } },
          ],
        },
        data: {
          orderAppliedVersion: projection.orderAppliedVersion,
          orderAppliedAt: new Date(event.data.appliedAt),
          orderExists: projection.orderExists,
        },
      })
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }
}
