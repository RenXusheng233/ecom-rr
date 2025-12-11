import { getAuth } from '@clerk/express'
import { NextFunction, Request, Response } from 'express'

// FIXME
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string
    }
  }
}

export const ShouldBeUser = (
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
