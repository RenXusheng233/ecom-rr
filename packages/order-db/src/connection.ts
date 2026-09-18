import mongoose from 'mongoose'
import { OrderOutboxEvent } from './order-outbox-model'
import { Order } from './order-model'
import { PaymentEventInbox } from './payment-event-inbox-model'
import { RejectedPaymentEvent } from './rejected-payment-event-model'

let isConnected = false

export const connectOrderDB = async () => {
  if (isConnected) return

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in env file!')
  }

  await mongoose.connect(process.env.DATABASE_URL)
  try {
    const hello = await mongoose.connection.db?.admin().command({ hello: 1 })
    if (!hello?.setName) {
      throw new Error('Order MongoDB must run as a replica set')
    }

    await Promise.all([
      Order.createIndexes(),
      PaymentEventInbox.createIndexes(),
      OrderOutboxEvent.createIndexes(),
      RejectedPaymentEvent.createIndexes(),
    ])

    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => {
        await Order.findOne({ orderId: '__transaction_probe__' })
          .session(session)
          .lean()
      })
    } finally {
      await session.endSession()
    }

    isConnected = true
    console.log('Connected to Order MongoDB replica set')
  } catch (error) {
    await mongoose.disconnect()
    throw error
  }
}

export const startOrderDbSession = () => mongoose.startSession()

export const disconnectOrderDB = async () => {
  if (!isConnected && mongoose.connection.readyState === 0) return
  await mongoose.disconnect()
  isConnected = false
}
