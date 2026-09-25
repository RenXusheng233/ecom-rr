import { BadGatewayException, NotFoundException } from '@nestjs/common'
import { clerkClient } from '../utils/clerk'
import { UserService } from './user.service'

jest.mock('../utils/clerk', () => ({
  clerkClient: { users: { getUser: jest.fn(), deleteUser: jest.fn() } },
}))

describe('UserService', () => {
  const service = new UserService()
  const getUser = clerkClient.users.getUser as jest.Mock
  const deleteUser = clerkClient.users.deleteUser as jest.Mock

  beforeEach(() => jest.resetAllMocks())

  it('returns successful Clerk results', async () => {
    getUser.mockResolvedValue({ id: 'user_1' })
    deleteUser.mockResolvedValue({ id: 'user_1', deleted: true })
    await expect(service.getUser('user_1')).resolves.toMatchObject({
      id: 'user_1',
    })
    await expect(service.deleteUser('user_1')).resolves.toMatchObject({
      deleted: true,
    })
  })

  it('exposes missing users as 404', async () => {
    getUser.mockRejectedValue({ status: 404 })
    deleteUser.mockRejectedValue({ status: 404 })
    await expect(service.getUser('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    await expect(service.deleteUser('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('exposes upstream failures rather than successful null responses', async () => {
    getUser.mockRejectedValue({ status: 503 })
    deleteUser.mockRejectedValue({ status: 503 })
    await expect(service.getUser('user_1')).rejects.toBeInstanceOf(
      BadGatewayException,
    )
    await expect(service.deleteUser('user_1')).rejects.toBeInstanceOf(
      BadGatewayException,
    )
  })
})
