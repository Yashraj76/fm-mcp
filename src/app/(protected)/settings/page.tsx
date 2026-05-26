import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'System Settings - FileMaker MCP',
  description: 'Configure global preferences, AI models, rate limits, and security protocols.',
}

const SettingsPage = dynamic(
  () => import('@/components/settings/settings-page').then((mod) => mod.SettingsPage),
  {
    loading: () => (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }
)

export default function Page() {
  return <SettingsPage />
}
