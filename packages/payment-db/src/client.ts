import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({
  connectionString: process.env.PAYMENT_DATABASE_URL,
})

const globalForPrisma = global as unknown as { paymentPrisma: PrismaClient }

export const paymentPrisma =
  globalForPrisma.paymentPrisma || new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.paymentPrisma = paymentPrisma
}
