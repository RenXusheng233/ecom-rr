import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { clerkClient } from '../utils/clerk'

const rethrowClerkError = (error: unknown, action: string): never => {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 404
  ) {
    throw new NotFoundException('User not found')
  }
  throw new BadGatewayException(`Failed to ${action} user`)
}

@Injectable()
export class UserService {
  async getUsers(): Promise<unknown> {
    const users = await clerkClient.users.getUserList()
    return users
  }

  async getUser(id: string): Promise<unknown> {
    try {
      const user = await clerkClient.users.getUser(id)
      return user
    } catch (error) {
      rethrowClerkError(error, 'fetch')
    }
  }

  async createUser(
    newUser: Parameters<typeof clerkClient.users.createUser>[0],
  ): Promise<unknown> {
    const user = await clerkClient.users.createUser(newUser)
    return user
  }

  async deleteUser(id: string): Promise<unknown> {
    try {
      const user = await clerkClient.users.deleteUser(id)
      return user
    } catch (error) {
      rethrowClerkError(error, 'delete')
    }
  }
}
