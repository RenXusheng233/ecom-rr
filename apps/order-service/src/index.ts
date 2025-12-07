import Fastify from 'fastify'

const fastify = Fastify()
const port = 8001

fastify.get('/health', (request, reply) => {
  return reply.status(200).send({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  })
})

const start = async () => {
  try {
    await fastify.listen({ port })
    console.log(`Order service is running on port ${port}`)
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

start()
