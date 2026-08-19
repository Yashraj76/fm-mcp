'use client'

import {
  LayoutDashboard,
  Database,
  Server,
  GitBranch,
  Wrench,
  Play,
  Rocket,
  Settings,
} from 'lucide-react'
import { type AppView } from '@/lib/store'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'

interface NavItem {
  title: string
  icon: React.ElementType
  view: AppView
  href: string
}

const mainNav: NavItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, view: 'dashboard', href: '/' },
  { title: 'Connections', icon: Database, view: 'connections', href: '/connections' },
  { title: 'Servers', icon: Server, view: 'servers', href: '/servers' },
]

const developmentNav: NavItem[] = [
  { title: 'Branches', icon: GitBranch, view: 'branches', href: '/branches' },
  { title: 'Tools', icon: Wrench, view: 'tools', href: '/tools' },
  { title: 'Playground', icon: Play, view: 'playground', href: '/playground' },
]

const operationsNav: NavItem[] = [
  { title: 'Deployments', icon: Rocket, view: 'deployments', href: '/deployments' },
]

const settingsNav: NavItem[] = [
  { title: 'Settings', icon: Settings, view: 'settings', href: '/settings' },
]

export function AppSidebar({ userNav }: { userNav?: React.ReactNode }) {
  const pathname = usePathname()

  const renderNavGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <SidebarMenuItem key={item.view}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.title}
                >
                  <Link href={item.href}>
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" isActive={false}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg overflow-hidden">
                <img src="/logo.svg" alt="kilink" className="size-8" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">kilink</span>
                <span className="text-xs text-muted-foreground">by kibizsystems</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <div className="flex flex-col gap-1 px-2 pt-2">
          {renderNavGroup('Main', mainNav)}
          {renderNavGroup('Development', developmentNav)}
          {renderNavGroup('Operations', operationsNav)}
          {renderNavGroup('Settings', settingsNav)}
        </div>
      </SidebarContent>

      {userNav && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              {userNav}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}

      <SidebarRail />
    </Sidebar>
  )
}
