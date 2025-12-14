import cors from 'cors'
import express, { NextFunction, Request, Response } from 'express'
import { clerkClient, clerkMiddleware } from '@clerk/express'
import { ShouldBeUser } from './middleware/authMiddleware.js'
import productRouter from './routes/product.route.js'
import categoryRouter from './routes/category.route.js'

const app = express()
const port = 8000

app.use(clerkMiddleware())
app.use(express.json())

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

app.use('/products', productRouter)
app.use('/categories', categoryRouter)

// Error Handler
app.use(
  (
    err: { status: number; message: string },
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    console.log(err)
    return res
      .status(err.status || 500)
      .json({ message: err.message || 'Internal Server Error!' })
  },
)

app.listen(port, () => {
  console.log(`Product service is running on port ${port}`)
})
