import Fastify from 'fastify'
import { clerkClient, clerkPlugin } from '@clerk/fastify'
import { shouldBeUser } from './middleware/authMiddleware'
import { connectOrderDB } from '@repo/order-db'
import { orderRoute } from './routes/order'

const fastify = Fastify()
const port = 8001

fastify.register(clerkPlugin)

fastify.get('/health', (request, reply) => {
  try {
    return reply.code(200).send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
    })
  } catch (error) {
    fastify.log.error(error)
    reply.code(500).send({ error: 'Health check failed' })
  }
})

fastify.get('/test', { preHandler: shouldBeUser }, async (request, reply) => {
  try {
    const user = await clerkClient.users.getUser(request.userId)
    return reply.send({
      message: 'User retrieved from order service',
      user,
    })
  } catch (error) {
    fastify.log.error(error)
    return reply
      .code(500)
      .send({ error: 'Failed to retrieve user from order service' })
  }
})

fastify.register(orderRoute)

const start = async () => {
  try {
    await connectOrderDB()
    await fastify.listen({ port })
    console.log(`Order service is running on port ${port}`)
  } catch (error) {
    fastify.log.error(error)
    process.exit(1)
  }
}

start()
