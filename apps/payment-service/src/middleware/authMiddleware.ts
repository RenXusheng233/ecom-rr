import { getAuth } from '@hono/clerk-auth'
import { createMiddleware } from 'hono/factory'
import { CustomJwtSessionClaims } from '@repo/types'

export const shouldBeUser = createMiddleware<{
  Variables: {
    userId: string
  }
}>(async (c, next) => {
  const auth = getAuth(c)

  if (!auth?.userId) {
    return c.json(
      {
        error: 'You are not logged in from payment service',
      },
      401,
    )
  }

  c.set('userId', auth.userId)

  await next()
})

export const shouldBeAdmin = createMiddleware<{
  Variables: {
    userId: string
  }
}>(async (c, next) => {
  const auth = getAuth(c)

  if (!auth?.userId) {
    return c.json(
      {
        error: 'You are not logged in from payment service',
      },
      401,
    )
  }

  const claims = auth.sessionClaims as CustomJwtSessionClaims
  if (claims?.metadata?.role !== 'admin') {
    return c.json(
      {
        error: 'Unauthorized',
      },
      403,
    )
  }

  c.set('userId', auth.userId)

  await next()
})
