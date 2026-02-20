'use client'

import { Button } from '@/components/ui/button'
import { useAuth } from '@clerk/nextjs'

const Page = () => {
  const { signOut } = useAuth()

  return (
    <div className="w-full h-screen flex items-center justify-center">
      <h1 className="font-semibold text-2xl">
        You do not have an access!&nbsp;
      </h1>
      <Button className="cursor-pointer" onClick={() => signOut()}>
        Sign Out
      </Button>
    </div>
  )
}

export default Page
