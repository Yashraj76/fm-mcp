import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Console Dashboard - FileMaker MCP',
  description: 'Overview of FileMaker MCP servers, connection status, active tools, and deployment history.',
}

const DashboardPage = dynamic(
  () => import('@/components/dashboard/dashboard-page').then((mod) => mod.DashboardPage),
  {
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Home() {
  return <DashboardPage />
}
