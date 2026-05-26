import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'MCP Servers Registry - FileMaker MCP',
  description: 'Configure Model Context Protocol (MCP) server endpoints, security access tokens, and environments.',
}

const ServersPage = dynamic(
  () => import('@/components/servers/servers-page').then((mod) => mod.ServersPage),
  {
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Page() {
  return <ServersPage />
}
