import AppLineChart from '@/components/AppLineChart'
import EditUser from '@/components/EditUser'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetTrigger } from '@/components/ui/sheet'
import { auth, User } from '@clerk/nextjs/server'
import { BadgeCheck, Candy, Citrus, Shield } from 'lucide-react'

const getData = async (id: string): Promise<User | null> => {
  const { getToken } = await auth()
  const token = await getToken()
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}/users/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )
    const data = await res.json()
    return data
  } catch (error) {
    console.error('Error fetching users:', error)
    return null
  }
}

const SingleUserPage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const user = await getData(id)
  const {
    firstName,
    lastName,
    username,
    imageUrl,
    emailAddresses,
    phoneNumbers,
    publicMetadata,
    banned,
    createdAt,
  } = user || {}

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    )
  }

  const renderBreadcrumb = () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/users">Users</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>
            {`${firstName}` + ' ' + `${lastName}` || `${username}` || '-'}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )

  const renderUserBadges = () => (
    <div className="bg-primary-foreground p-4 rounded-lg">
      <h1 className="text-xl font-semibold">User Badges</h1>
      <div className="flex gap-4 mt-4">
        <HoverCard>
          <HoverCardTrigger>
            <BadgeCheck
              size={36}
              className="rounded-full bg-blue-500/30 border border-blue-500/50 p-1.5"
            />
          </HoverCardTrigger>
          <HoverCardContent>
            <h1 className="font-bold mb-2">Verified User</h1>
            <p className="text-sm text-muted-foreground">
              This user has been verified by the admin.
            </p>
          </HoverCardContent>
        </HoverCard>
        <HoverCard>
          <HoverCardTrigger>
            <Shield
              size={36}
              className="rounded-full bg-green-800/30 border border-green-800/50 p-1.5"
            />
          </HoverCardTrigger>
          <HoverCardContent>
            <h1 className="font-bold mb-2">Admin</h1>
            <p className="text-sm text-muted-foreground">
              Admin users have access to all features and can manage users.
            </p>
          </HoverCardContent>
        </HoverCard>
        <HoverCard>
          <HoverCardTrigger>
            <Candy
              size={36}
              className="rounded-full bg-yellow-500/30 border border-yellow-500/50 p-1.5"
            />
          </HoverCardTrigger>
          <HoverCardContent>
            <h1 className="font-bold mb-2">Awarded</h1>
            <p className="text-sm text-muted-foreground">
              This user has been awarded for their contributions.
            </p>
          </HoverCardContent>
        </HoverCard>
        <HoverCard>
          <HoverCardTrigger>
            <Citrus
              size={36}
              className="rounded-full bg-orange-500/30 border border-orange-500/50 p-1.5"
            />
          </HoverCardTrigger>
          <HoverCardContent>
            <h1 className="font-bold mb-2">Popular</h1>
            <p className="text-sm text-muted-foreground">
              This user has been popular in the community.
            </p>
          </HoverCardContent>
        </HoverCard>
      </div>
    </div>
  )

  const renderInformation = () => (
    <div className="bg-primary-foreground p-4 rounded-lg">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">User Information</h1>
        <Sheet>
          <SheetTrigger asChild>
            <Button size="sm">Edit User</Button>
          </SheetTrigger>
          <EditUser />
        </Sheet>
      </div>
      <div className="space-y-4 mt-4">
        <div className="flex flex-col gap-2 mb-8">
          <p className="text-sm text-muted-foreground">Profile Completion</p>
          <Progress value={66} />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">Fullname:</span>
          <span>
            {`${firstName}` + ' ' + `${lastName}` || `${username}` || '-'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">Email:</span>
          <span>{emailAddresses?.[0]?.emailAddress || '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">Phone:</span>
          <span>{phoneNumbers?.[0]?.phoneNumber || '-'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">Role:</span>
          <span>{String(publicMetadata?.role) || 'user'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">Status:</span>
          <span>{banned ? 'Banned' : 'Active'}</span>
        </div>
        <p className="text-sm text-muted-foreground mt-4">
          Joined on{' '}
          {createdAt ? new Date(createdAt).toLocaleDateString('zh-CN') : '-'}
        </p>
      </div>
    </div>
  )

  const renderUserCard = () => (
    <div className="bg-primary-foreground p-4 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <Avatar className="size-12">
          <AvatarImage src={imageUrl || ''} />
          <AvatarFallback>{`${firstName?.[0] || ''}${lastName?.[0] || '-'}`}</AvatarFallback>
        </Avatar>
        <h1 className="text-xl font-semibold">
          {`${firstName}` + ' ' + `${lastName}` || `${username}` || '-'}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground">
        We will cross that bridge when we come to it.
      </p>
    </div>
  )

  return (
    <div className="">
      {renderBreadcrumb()}
      {/* CONTAINER */}
      <div className="mt-4 flex flex-col xl:flex-row gap-8">
        {/* LEFT */}
        <div className="w-full xl:w-2/5 space-y-6">
          {renderUserBadges()}
          {renderUserCard()}
          {renderInformation()}
        </div>
        {/* RIGHT */}
        <div className="w-full xl:w-3/5 space-y-6">
          {/* CHART CONTAINER */}
          <div className="bg-primary-foreground p-4 rounded-lg">
            <h1 className="text-xl font-semibold">User Activity</h1>
            <AppLineChart />
          </div>
        </div>
      </div>
    </div>
  )
}

export default SingleUserPage
