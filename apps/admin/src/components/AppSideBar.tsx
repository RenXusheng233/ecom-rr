import Link from 'next/link'
import Image from 'next/image'
import {
  Calendar,
  ChevronUp,
  Home,
  Inbox,
  Plus,
  Search,
  Settings,
  Shirt,
  ShoppingBasket,
  User,
  User2,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from './ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Sheet, SheetTrigger } from './ui/sheet'
import AddOrder from './AddOrder'
import AddUser from './AddUser'
import AddCategory from './AddCategory'
import AddProduct from './AddProduct'

// Menu items.
const items = [
  {
    title: 'Home',
    url: '/',
    icon: Home,
  },
  {
    title: 'Inbox',
    url: '#',
    icon: Inbox,
  },
  {
    title: 'Calendar',
    url: '#',
    icon: Calendar,
  },
  {
    title: 'Search',
    url: '#',
    icon: Search,
  },
  {
    title: 'Settings',
    url: '#',
    icon: Settings,
  },
]

// Header
const renderHeader = () => (
  <SidebarHeader className="py-4">
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild>
          <Link href="/">
            <Image
              src="/logo.svg"
              alt="logo"
              width={16}
              height={16}
              loading="eager"
              className="rounded-full"
            />
            <span>RR Dev</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarHeader>
)

// Application
const renderApplicationGroup = () => (
  <SidebarGroup>
    <SidebarGroupLabel>Application</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton asChild>
              <Link href={item.url}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
            {item.title === 'Inbox' && <SidebarMenuBadge>24</SidebarMenuBadge>}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

// Products
const renderProductsGroup = () => (
  <SidebarGroup>
    <SidebarGroupLabel>Products</SidebarGroupLabel>
    <SidebarGroupAction>
      <Plus /> <span className="sr-only">Add Product</span>
    </SidebarGroupAction>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link href="/products">
              <Shirt />
              See All Products
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu>
        <SidebarMenuItem>
          <Sheet>
            <SheetTrigger asChild>
              <SidebarMenuButton asChild>
                <Link href="#">
                  <Plus />
                  Add Product
                </Link>
              </SidebarMenuButton>
            </SheetTrigger>
            <AddProduct />
          </Sheet>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <Sheet>
            <SheetTrigger asChild>
              <SidebarMenuButton asChild>
                <Link href="#">
                  <Plus />
                  Add Category
                </Link>
              </SidebarMenuButton>
            </SheetTrigger>
            <AddCategory />
          </Sheet>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

const renderUsersGroup = () => (
  <SidebarGroup>
    <SidebarGroupLabel>Users</SidebarGroupLabel>
    <SidebarGroupAction>
      <Plus /> <span className="sr-only">Add User</span>
    </SidebarGroupAction>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link href="/users">
              <User />
              See All Users
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu>
        <SidebarMenuItem>
          <Sheet>
            <SheetTrigger asChild>
              <SidebarMenuButton asChild>
                <Link href="#">
                  <Plus />
                  Add User
                </Link>
              </SidebarMenuButton>
            </SheetTrigger>
            <AddUser />
          </Sheet>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

const renderOrdersGroup = () => (
  <SidebarGroup>
    <SidebarGroupLabel>Orders / Payments</SidebarGroupLabel>
    <SidebarGroupAction>
      <Plus /> <span className="sr-only">Add Order</span>
    </SidebarGroupAction>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link href="/payments">
              <ShoppingBasket />
              See All Transactions
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu>
        <SidebarMenuItem>
          <Sheet>
            <SheetTrigger asChild>
              <SidebarMenuButton asChild>
                <Link href="#">
                  <Plus />
                  Add Order
                </Link>
              </SidebarMenuButton>
            </SheetTrigger>
            <AddOrder />
          </Sheet>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)

const renderFooter = () => (
  <SidebarFooter>
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton>
              <User2 />
              Richard
              <ChevronUp className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="dropdown-content-width-full">
            <DropdownMenuItem>
              <span>Account</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
)

const AppSideBar = () => {
  return (
    <Sidebar collapsible="icon">
      {renderHeader()}
      <SidebarSeparator />
      <SidebarContent>
        {renderApplicationGroup()}
        {renderProductsGroup()}
        {renderUsersGroup()}
        {renderOrdersGroup()}
      </SidebarContent>
      {renderFooter()}
    </Sidebar>
  )
}

export default AppSideBar
