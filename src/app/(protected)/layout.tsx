import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AppSidebar } from '@/components/app-sidebar'
import { UserNav } from '@/components/auth/user-nav'
import { requireUser } from '@/lib/auth/get-user'
import { ViewRouteSync } from '@/components/view-route-sync'
import { GlobalDialogs } from '@/components/global-dialogs'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'kilink — Console',
  description: 'Manage your MCP servers, connections, tools, and deployments.',
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects to /login if no session — never renders children for unauth users
  const user = await requireUser();

  return (
    <SidebarProvider>
      <AppSidebar userNav={<UserNav />} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium">kilink</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">Console</span>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <ViewRouteSync />
          <GlobalDialogs />
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
