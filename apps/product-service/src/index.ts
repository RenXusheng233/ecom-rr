import express, { Request, Response } from 'express'
import { clerkClient, clerkMiddleware } from '@clerk/express'
import cors from 'cors'
import { ShouldBeUser } from './middleware/authMiddleware.js'

const app = express()
const port = 8000

app.use(clerkMiddleware())

app.use(
  cors({
    origin: ['http://localhost:3002', 'http://localhost:3003'],
    credentials: true,
  }),
)

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
  })
})

app.get('/test', ShouldBeUser, async (req: Request, res: Response) => {
  const user = await clerkClient.users.getUser(req.userId)
  res.json({ message: 'User retrieved from product service', user })
})

app.listen(port, () => {
  console.log(`Product service is running on port ${port}`)
})
