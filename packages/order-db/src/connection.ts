import mongoose from 'mongoose'

let isConnected = false

export const connectOrderDB = async () => {
  if (isConnected) return

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined in env file!')
  }

  try {
    mongoose.connect(process.env.DATABASE_URL)
    isConnected = true
  } catch (error) {
    console.log(error)
    throw error
  }
}
