import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Interactive Playground - FileMaker MCP',
  description: 'Test and execute MCP tools dynamically inside an interactive agentic chat command center.',
}

const ToolPlayground = dynamic(
  () => import('@/components/tools/tool-playground').then((mod) => mod.ToolPlayground),
  { 
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Page() {
  return <ToolPlayground />
}
