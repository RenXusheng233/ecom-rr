import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { clerkMiddleware } from '@clerk/express'
import * as cors from 'cors'

const PORT = 8003

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.use(
    cors({
      origin: 'http://localhost:3001',
      credentials: true,
    }),
  )
  app.use(clerkMiddleware())
  await app.listen(process.env.PORT ?? PORT)
}
bootstrap()
