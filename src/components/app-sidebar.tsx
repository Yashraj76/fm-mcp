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
import { useAppStore, type AppView } from '@/lib/store'
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
import { Badge } from '@/components/ui/badge'

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

const modeColors = {
  edit: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  staging: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  deployed: 'bg-sky-500/15 text-sky-500 border-sky-500/25',
}

const modeLabels = {
  edit: 'Edit',
  staging: 'Staging',
  deployed: 'Deployed',
}

export function AppSidebar({ userNav }: { userNav?: React.ReactNode }) {
  const serverMode = useAppStore((s) => s.serverMode)
  const setServerMode = useAppStore((s) => s.setServerMode)
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <span className="text-xs text-muted-foreground shrink-0">Mode:</span>
              <div className="flex gap-1">
                {(Object.keys(modeLabels) as Array<keyof typeof modeLabels>).map(
                  (mode) => (
                    <button
                      key={mode}
                      onClick={() => setServerMode(mode)}
                      className="focus:outline-none"
                    >
                      <Badge
                        variant="outline"
                        className={`cursor-pointer text-[10px] px-1.5 py-0 transition-colors ${
                          serverMode === mode
                            ? modeColors[mode]
                            : 'text-muted-foreground/50 border-transparent hover:text-muted-foreground'
                        }`}
                      >
                        {modeLabels[mode]}
                      </Badge>
                    </button>
                  )
                )}
              </div>
            </div>
          </SidebarMenuItem>
          {userNav && (
            <SidebarMenuItem>
              {userNav}
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
