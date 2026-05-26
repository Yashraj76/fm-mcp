import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Tools Registry - FileMaker MCP',
  description: 'Configure, manage, and toggle FileMaker-backed database tools and custom AI workflows.',
}

const ToolsPage = dynamic(
  () => import('@/components/tools/tools-page').then((mod) => mod.ToolsPage),
  { 
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Page() {
  return <ToolsPage />
}
