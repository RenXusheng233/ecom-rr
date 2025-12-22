import { getAuth } from '@clerk/fastify'
import { FastifyReply, FastifyRequest } from 'fastify'
import { CustomJwtSessionClaims } from '@repo/types'

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
      .status(401)
      .send({ error: 'You are not logged in from order service' })
  }

  request.userId = userId
}

export const shouldBeAdmin = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const auth = getAuth(request)

  if (!auth.isAuthenticated) {
    return reply
      .status(401)
      .send({ error: 'You are not logged in from order service' })
  }

  const claims = auth.sessionClaims as CustomJwtSessionClaims
  if (claims?.metadata?.role !== 'admin') {
    return reply.status(403).send({ error: 'Unauthorized' })
  }

  request.userId = auth.userId
}
