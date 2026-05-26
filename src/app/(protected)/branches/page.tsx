import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Feature Branches - FileMaker MCP',
  description: 'Manage development and staging branches for FileMaker database schemas and tool overrides.',
}

const BranchesPage = dynamic(
  () => import('@/components/branches/branches-page').then((mod) => mod.BranchesPage),
  {
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Page() {
  return <BranchesPage />
}
