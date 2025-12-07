import express from 'express'
import cors from 'cors'

const app = express()
const port = 8000

app.use(
  cors({
    origin: ['http://localhost:3002', 'http://localhost:3003'],
    credentials: true,
  }),
)

app.listen(port, () => {
  console.log(`Product service is running on ${port} 8000`)
})
