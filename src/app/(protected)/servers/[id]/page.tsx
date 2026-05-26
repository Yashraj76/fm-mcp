import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Server Console - FileMaker MCP',
  description: 'Monitor detailed MCP server tools, staging features, and release configurations.',
}

const ServerDetailPage = dynamic(
  () => import('@/components/servers/server-detail-page').then((mod) => mod.ServerDetailPage),
  {
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  return <ServerDetailPage serverId={id} />
}
