import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

const start = async () => {
  try {
    serve(
      {
        fetch: app.fetch,
        port: 8002,
      },
      (info) => {
        console.log(`Payment service is running on port ${info.port}`)
      },
    )
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

start()
