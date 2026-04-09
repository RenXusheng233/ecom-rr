import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { UserService } from './user.service'
import { ShouldBeAdminGuard } from '../guards/should-be-admin.guard'
import { clerkClient } from '@clerk/express'

@Controller('users')
@UseGuards(ShouldBeAdminGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  getUsers(): Promise<unknown> {
    return this.userService.getUsers()
  }

  @Get(':id')
  getUser(@Param('id') id: string): Promise<unknown> {
    return this.userService.getUser(id)
  }

  @Post()
  createUser(
    @Body() newUser: Parameters<typeof clerkClient.users.createUser>[0],
  ): Promise<unknown> {
    return this.userService.createUser(newUser)
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string): Promise<unknown> {
    return this.userService.deleteUser(id)
  }
}
