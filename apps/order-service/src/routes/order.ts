import { FastifyInstance } from 'fastify'
import { shouldBeAdmin, shouldBeUser } from '../middleware/authMiddleware'
import { Order, OrderStatus } from '@repo/order-db'
import { startOfMonth, subMonths } from 'date-fns'
import { OrderChartType } from '@repo/types'

export const orderRoute = async (fastify: FastifyInstance) => {
  fastify.get(
    '/orders',
    { preHandler: shouldBeAdmin },
    async (request, reply) => {
      const { limit } = request.query as { limit: number }

      const orders = await Order.find().limit(limit).sort({ createdAt: -1 })
      return reply.send(orders)
    },
  )

  fastify.get(
    '/user-orders',
    { preHandler: shouldBeUser },
    async (request, reply) => {
      const orders = await Order.find({ userId: request.userId })
      return reply.send(orders)
    },
  )

  fastify.get(
    '/order-chart',
    { preHandler: shouldBeAdmin },
    async (request, reply) => {
      const now = new Date()
      const eightMonthsAgo = startOfMonth(subMonths(now, 7))

      const raw = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: eightMonthsAgo, $lte: now },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            total: { $sum: 1 },
            successful: {
              $sum: {
                $cond: [{ $eq: ['$status', OrderStatus[0]] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            _id: 0,
            year: '$_id.year',
            month: '$_id.month',
            total: 1,
            successful: 1,
          },
        },
        {
          $sort: { year: 1, month: 1 },
        },
      ])

      const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ]

      const results: OrderChartType[] = []

      for (let i = 7; i >= 0; i--) {
        const date = subMonths(now, i)
        const month = date.getMonth() + 1
        const year = date.getFullYear()

        const data = raw.find(
          (item) => item.month === month && item.year === year,
        )

        results.push({
          month: monthNames[month - 1] as string,
          total: data ? data.total : 0,
          successful: data ? data.successful : 0,
        })
      }

      return reply.send(results)
    },
  )
}
