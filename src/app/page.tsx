'use client'

import { useAppStore } from '@/lib/store'
import { AppSidebar } from '@/components/app-sidebar'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'

// Page components
import { DashboardPage } from '@/components/dashboard/dashboard-page'
import { ConnectionsPage } from '@/components/connections/connections-page'
import { ServersPage } from '@/components/servers/servers-page'
import { ServerDetailPage } from '@/components/servers/server-detail-page'
import { BranchesPage } from '@/components/branches/branches-page'
import { ToolsPage } from '@/components/tools/tools-page'
import { ToolPlayground } from '@/components/tools/tool-playground'
import { DeploymentsPage } from '@/components/deployments/deployments-page'
import { SettingsPage } from '@/components/settings/settings-page'

// Dialog components
import { ConnectionDialog } from '@/components/connections/connection-dialog'
import { ServerDialog } from '@/components/servers/server-dialog'
import { BranchDialog } from '@/components/branches/branch-dialog'
import { ToolDialog } from '@/components/tools/tool-dialog'
import { ConfigDialog } from '@/components/servers/config-dialog'
import { AiAssistantDialog } from '@/components/ai/ai-assistant-dialog'

function ViewRouter() {
  const { currentView } = useAppStore()

  switch (currentView) {
    case 'dashboard': return <DashboardPage />
    case 'connections': return <ConnectionsPage />
    case 'servers': return <ServersPage />
    case 'server-detail': return <ServerDetailPage />
    case 'branches': return <BranchesPage />
    case 'tools': return <ToolsPage />
    case 'playground': return <ToolPlayground />
    case 'deployments': return <DeploymentsPage />
    case 'settings': return <SettingsPage />
    default: return <DashboardPage />
  }
}

function GlobalDialogs() {
  const { showConnectionDialog, showServerDialog, showBranchDialog, showToolDialog, showConfigDialog, showAiDialog } = useAppStore()
  return (
    <>
      {showConnectionDialog && <ConnectionDialog />}
      {showServerDialog && <ServerDialog />}
      {showBranchDialog && <BranchDialog />}
      {showToolDialog && <ToolDialog />}
      {showConfigDialog && <ConfigDialog />}
      {showAiDialog && <AiAssistantDialog />}
    </>
  )
}

export default function Home() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex items-center gap-1.5 text-sm">
            <span className="font-medium">MCP Platform</span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">FileMaker</span>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6 overflow-auto">
          <ViewRouter />
        </div>
        <GlobalDialogs />
      </SidebarInset>
    </SidebarProvider>
  )
}
