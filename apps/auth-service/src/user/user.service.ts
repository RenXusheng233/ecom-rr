import { Injectable } from '@nestjs/common'
import { clerkClient } from '../utils/clerk'

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
      console.error('Error fetching user:', error)
      return null
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
      console.error('Error deleting user:', error)
      return null
    }
  }
}
