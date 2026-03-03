import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

const PORT = 8003

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  await app.listen(process.env.PORT ?? PORT)
}
bootstrap()
