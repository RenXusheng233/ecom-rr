import { Injectable } from '@nestjs/common'
import { clerkClient } from '../utils/clerk'

@Injectable()
export class UserService {
  async getUsers(): Promise<unknown> {
    return clerkClient.users.getUserList()
  }

  async getUser(id: string): Promise<unknown> {
    return clerkClient.users.getUser(id)
  }

  async createUser(
    newUser: Parameters<typeof clerkClient.users.createUser>[0],
  ): Promise<unknown> {
    const user = await clerkClient.users.createUser(newUser)
    return user
  }

  async deleteUser(id: string): Promise<unknown> {
    const user = await clerkClient.users.deleteUser(id)
    return user
  }
}
