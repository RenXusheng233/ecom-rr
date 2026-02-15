import { cookies } from 'next/headers'
import AppSideBar from '@/components/AppSideBar'
import NavBar from '@/components/NavBar'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import { SidebarProvider } from '@/components/ui/sidebar'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get('sidebar_state')?.value === 'true'

  return (
    <div className="flex">
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <SidebarProvider defaultOpen={defaultOpen}>
          <AppSideBar />
          <main className="w-full">
            <NavBar />
            <div className="px-4">{children}</div>
          </main>
        </SidebarProvider>
      </ThemeProvider>
    </div>
  )
}
