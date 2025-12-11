import { getAuth } from '@clerk/fastify'
import { FastifyReply, FastifyRequest } from 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

export const shouldBeUser = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { isAuthenticated, userId } = getAuth(request)

  if (!isAuthenticated) {
    return reply
      .code(401)
      .send({ error: 'You are not logged in from order service' })
  }

  request.userId = userId
}
