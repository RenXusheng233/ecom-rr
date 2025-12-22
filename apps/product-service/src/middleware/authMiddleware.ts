import { getAuth } from '@clerk/express'
import { NextFunction, Request, Response } from 'express'
import { CustomJwtSessionClaims } from '@repo/types'

// FIXME
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string
    }
  }
}

export const shouldBeUser = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { isAuthenticated, userId } = getAuth(req)

  if (!isAuthenticated) {
    return res
      .status(401)
      .json({ error: 'You are not logged in from product service' })
  }

  req.userId = userId

  return next()
}

export const shouldBeAdmin = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req)

  if (!auth.isAuthenticated) {
    return res
      .status(401)
      .json({ error: 'You are not logged in from product service' })
  }

  const claims = auth.sessionClaims as CustomJwtSessionClaims
  if (claims?.metadata?.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  req.userId = auth.userId

  return next()
}
