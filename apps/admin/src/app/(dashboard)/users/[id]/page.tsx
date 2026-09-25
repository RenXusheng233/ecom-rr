import AppLineChart from '@/components/AppLineChart'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { auth, User } from '@clerk/nextjs/server'

const getData = async (id: string): Promise<User | null> => {
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) throw new Error('Authentication required')
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_AUTH_SERVICE_URL}/users/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Failed to load user')
  return (await res.json()) as User
}

const SingleUserPage = async ({
  params,
}: {
  params: Promise<{ id: string }>
}) => {
  const { id } = await params
  const user = await getData(id)

  if (!user) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    )
  }

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
  } = user
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || username || '-'

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
          <BreadcrumbPage>{displayName}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )

  const renderInformation = () => (
    <div className="bg-primary-foreground p-4 rounded-lg">
      <h1 className="text-xl font-semibold">User Information</h1>
      <div className="space-y-4 mt-4">
        <div className="flex items-center gap-2">
          <span className="font-bold">Fullname:</span>
          <span>{displayName}</span>
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
          <span>{String(publicMetadata?.role ?? 'user')}</span>
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
        <h1 className="text-xl font-semibold">{displayName}</h1>
      </div>
    </div>
  )

  return (
    <div className="">
      {renderBreadcrumb()}
      {/* CONTAINER */}
      <div className="mt-4 flex flex-col xl:flex-row gap-8">
        {/* LEFT */}
        <div className="w-full xl:w-2/5 space-y-6">
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
