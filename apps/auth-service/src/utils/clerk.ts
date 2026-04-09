import { createClerkClient } from '@clerk/express'

let _clerkClient: ReturnType<typeof createClerkClient> | null = null

export const clerkClient = new Proxy(
  {} as ReturnType<typeof createClerkClient>,
  {
    get(_target, prop) {
      if (!_clerkClient) {
        _clerkClient = createClerkClient({
          secretKey: process.env.CLERK_SECRET_KEY!,
        })
      }
      return (_clerkClient as never)[prop]
    },
  },
)
