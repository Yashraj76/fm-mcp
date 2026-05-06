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
}

const mainNav: NavItem[] = [
  { title: 'Dashboard', icon: LayoutDashboard, view: 'dashboard' },
  { title: 'Connections', icon: Database, view: 'connections' },
  { title: 'Servers', icon: Server, view: 'servers' },
]

const developmentNav: NavItem[] = [
  { title: 'Branches', icon: GitBranch, view: 'branches' },
  { title: 'Tools', icon: Wrench, view: 'tools' },
  { title: 'Playground', icon: Play, view: 'playground' },
]

const operationsNav: NavItem[] = [
  { title: 'Deployments', icon: Rocket, view: 'deployments' },
]

const settingsNav: NavItem[] = [
  { title: 'Settings', icon: Settings, view: 'settings' },
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

export function AppSidebar() {
  const { currentView, setCurrentView, serverMode, setServerMode } = useAppStore()

  const renderNavGroup = (label: string, items: NavItem[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.view}>
              <SidebarMenuButton
                isActive={currentView === item.view}
                onClick={() => setCurrentView(item.view)}
                tooltip={item.title}
              >
                <item.icon className="size-4" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
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
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Database className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">MCP Platform</span>
                <span className="text-xs text-muted-foreground">FileMaker Server</span>
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
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
