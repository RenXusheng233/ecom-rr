import type { DisputeStatus, PaymentStatus, RefundStatus } from '@repo/types'

export type PaymentState = {
  paymentStatus: PaymentStatus
  refundStatus: RefundStatus
  disputeStatus: DisputeStatus
  amountTotal: number
  amountRefunded: number
}

export type PaymentCommand =
  | { type: 'CHECKOUT_COMPLETED'; paid: boolean }
  | { type: 'PAYMENT_SUCCEEDED' }
  | { type: 'PAYMENT_FAILED' }
  | { type: 'PAYMENT_CANCELED' }
  | { type: 'CHECKOUT_EXPIRED' }
  | { type: 'REFUND_UPDATED'; amountRefunded: number }
  | { type: 'DISPUTE_OPENED' }
  | { type: 'DISPUTE_CLOSED'; outcome: 'WON' | 'LOST' }

const isSuccessful = (state: PaymentState) =>
  state.paymentStatus === 'SUCCEEDED'

const isTerminalFailure = (state: PaymentState) =>
  state.paymentStatus === 'FAILED' ||
  state.paymentStatus === 'CANCELED' ||
  state.paymentStatus === 'EXPIRED'

const withPaymentStatus = (
  state: PaymentState,
  paymentStatus: PaymentStatus,
): PaymentState =>
  (isSuccessful(state) && paymentStatus !== 'SUCCEEDED') ||
  (isTerminalFailure(state) && paymentStatus === 'PROCESSING')
    ? state
    : { ...state, paymentStatus }

export const applyPaymentTransition = (
  state: PaymentState,
  command: PaymentCommand,
): { next: PaymentState; changed: boolean } => {
  let next = state

  switch (command.type) {
    case 'CHECKOUT_COMPLETED':
      next = withPaymentStatus(state, command.paid ? 'SUCCEEDED' : 'PROCESSING')
      break
    case 'PAYMENT_SUCCEEDED':
      next = withPaymentStatus(state, 'SUCCEEDED')
      break
    case 'PAYMENT_FAILED':
      next = withPaymentStatus(state, 'FAILED')
      break
    case 'PAYMENT_CANCELED':
      next = withPaymentStatus(state, 'CANCELED')
      break
    case 'CHECKOUT_EXPIRED':
      next = withPaymentStatus(state, 'EXPIRED')
      break
    case 'REFUND_UPDATED': {
      if (
        !Number.isSafeInteger(command.amountRefunded) ||
        command.amountRefunded < 0
      ) {
        throw new Error('Refunded amount must be a non-negative safe integer')
      }
      if (command.amountRefunded > state.amountTotal) {
        throw new Error('Refunded amount cannot exceed the payment total')
      }
      if (command.amountRefunded <= state.amountRefunded) {
        break
      }
      next = {
        ...state,
        paymentStatus: 'SUCCEEDED',
        amountRefunded: command.amountRefunded,
        refundStatus:
          command.amountRefunded === state.amountTotal ? 'FULL' : 'PARTIAL',
      }
      break
    }
    case 'DISPUTE_OPENED':
      if (state.disputeStatus === 'NONE') {
        next = {
          ...state,
          paymentStatus: 'SUCCEEDED',
          disputeStatus: 'OPEN',
        }
      }
      break
    case 'DISPUTE_CLOSED':
      if (state.disputeStatus !== 'WON' && state.disputeStatus !== 'LOST') {
        next = {
          ...state,
          paymentStatus: 'SUCCEEDED',
          disputeStatus: command.outcome,
        }
      }
      break
  }

  return {
    next,
    changed:
      next.paymentStatus !== state.paymentStatus ||
      next.refundStatus !== state.refundStatus ||
      next.disputeStatus !== state.disputeStatus ||
      next.amountRefunded !== state.amountRefunded,
  }
}
