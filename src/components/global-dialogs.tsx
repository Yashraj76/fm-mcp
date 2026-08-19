'use client'

import { useAppStore } from '@/lib/store'
import dynamic from 'next/dynamic'

// Lazy-load heavyweight dialog components
const ConnectionDialog = dynamic(
  () => import('@/components/connections/connection-dialog').then((mod) => mod.ConnectionDialog),
  { ssr: false }
)
const ServerDialog = dynamic(
  () => import('@/components/servers/server-dialog').then((mod) => mod.ServerDialog),
  { ssr: false }
)
const BranchDialog = dynamic(
  () => import('@/components/branches/branch-dialog').then((mod) => mod.BranchDialog),
  { ssr: false }
)
const ToolDialog = dynamic(
  () => import('@/components/tools/tool-dialog').then((mod) => mod.ToolDialog),
  { ssr: false }
)
const ConfigDialog = dynamic(
  () => import('@/components/servers/config-dialog').then((mod) => mod.ConfigDialog),
  { ssr: false }
)
export function GlobalDialogs() {
  const showConnectionDialog = useAppStore((s) => s.showConnectionDialog)
  const showServerDialog = useAppStore((s) => s.showServerDialog)
  const showBranchDialog = useAppStore((s) => s.showBranchDialog)
  const showToolDialog = useAppStore((s) => s.showToolDialog)
  const showConfigDialog = useAppStore((s) => s.showConfigDialog)

  return (
    <>
      {showConnectionDialog && <ConnectionDialog />}
      {showServerDialog && <ServerDialog />}
      {showBranchDialog && <BranchDialog />}
      {showToolDialog && <ToolDialog />}
      {showConfigDialog && <ConfigDialog />}
    </>
  )
}
