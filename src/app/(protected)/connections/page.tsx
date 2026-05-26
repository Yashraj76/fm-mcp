import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Database Connections - FileMaker MCP',
  description: 'Configure and manage FileMaker server database connections and OData data sources.',
}

const ConnectionsPage = dynamic(
  () => import('@/components/connections/connections-page').then((mod) => mod.ConnectionsPage),
  {
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Page() {
  return <ConnectionsPage />
}
