import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { getAuth } from '@clerk/express'
import { Request } from 'express'

interface CustomJwtSessionClaims {
  metadata?: { role?: 'user' | 'admin' }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string
    }
  }
}

@Injectable()
export class ShouldBeAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const auth = getAuth(req)

    if (!auth.isAuthenticated) {
      throw new UnauthorizedException('You are not logged in from auth service')
    }

    const claims = auth.sessionClaims as CustomJwtSessionClaims
    if (claims?.metadata?.role !== 'admin') {
      throw new ForbiddenException('Unauthorized')
    }

    req.userId = auth.userId
    return true
  }
}
