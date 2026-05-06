'use client'

import { useAppStore, type AppView } from '@/lib/store'
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

// Dialog components
import { ConnectionDialog } from '@/components/connections/connection-dialog'
import { ServerDialog } from '@/components/servers/server-dialog'
import { BranchDialog } from '@/components/branches/branch-dialog'
import { ToolDialog } from '@/components/tools/tool-dialog'
import { ConfigDialog } from '@/components/servers/config-dialog'
import { AiAssistantDialog } from '@/components/ai/ai-assistant-dialog'

import { Settings } from 'lucide-react'

function ViewRouter() {
  const { currentView } = useAppStore()

  switch (currentView) {
    case 'dashboard':
      return <DashboardPage />
    case 'connections':
      return <ConnectionsPage />
    case 'servers':
      return <ServersPage />
    case 'server-detail':
      return <ServerDetailPage />
    case 'branches':
      return <BranchesPage />
    case 'tools':
      return <ToolsPage />
    case 'playground':
      return <ToolPlayground />
    case 'deployments':
      return <DeploymentsPage />
    case 'settings':
      return <SettingsPage />
    default:
      return <DashboardPage />
  }
}

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Platform configuration and preferences</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-lg font-semibold">General</h3>
          <p className="text-sm text-muted-foreground mt-1">Configure platform-wide settings</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Default Theme</span>
              <span className="text-sm text-muted-foreground">Dark</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Auto-save</span>
              <span className="text-sm text-muted-foreground">Enabled</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Connection Timeout</span>
              <span className="text-sm text-muted-foreground">30s</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-lg font-semibold">FileMaker API</h3>
          <p className="text-sm text-muted-foreground mt-1">Data API and OData configuration</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">FM Data API Version</span>
              <span className="text-sm text-muted-foreground">v2</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Max Records per Request</span>
              <span className="text-sm text-muted-foreground">100</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Portal Depth Limit</span>
              <span className="text-sm text-muted-foreground">5</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-lg font-semibold">AI Configuration</h3>
          <p className="text-sm text-muted-foreground mt-1">AI-powered tool generation settings</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">AI Model</span>
              <span className="text-sm text-muted-foreground">GPT-4</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Max Suggestions</span>
              <span className="text-sm text-muted-foreground">10</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Auto-suggest on Schema Load</span>
              <span className="text-sm text-muted-foreground">Enabled</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-lg font-semibold">Security</h3>
          <p className="text-sm text-muted-foreground mt-1">Security and access control</p>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Encrypt Credentials</span>
              <span className="text-sm text-muted-foreground">AES-256</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Token Expiry</span>
              <span className="text-sm text-muted-foreground">15 min</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm">Audit Logging</span>
              <span className="text-sm text-muted-foreground">Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function GlobalDialogs() {
  const {
    showConnectionDialog,
    showServerDialog,
    showBranchDialog,
    showToolDialog,
    showConfigDialog,
    showAiDialog,
  } = useAppStore()

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
