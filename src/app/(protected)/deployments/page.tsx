import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Deployments & Rollbacks - FileMaker MCP',
  description: 'Deploy server configurations, view changelogs, manage release versions, and execute rollback operations.',
}

const DeploymentsPage = dynamic(
  () => import('@/components/deployments/deployments-page').then((mod) => mod.DeploymentsPage),
  {
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Page() {
  return <DeploymentsPage />
}
