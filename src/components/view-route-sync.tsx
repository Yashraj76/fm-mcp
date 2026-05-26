'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAppStore, type AppView } from '@/lib/store'

const viewToPath: Record<AppView, string> = {
  dashboard: '/',
  connections: '/connections',
  servers: '/servers',
  'server-detail': '/servers',
  branches: '/branches',
  tools: '/tools',
  playground: '/playground',
  deployments: '/deployments',
  settings: '/settings',
}

const pathToView: Record<string, AppView> = {
  '/': 'dashboard',
  '/connections': 'connections',
  '/servers': 'servers',
  '/branches': 'branches',
  '/tools': 'tools',
  '/playground': 'playground',
  '/deployments': 'deployments',
  '/settings': 'settings',
}

export function ViewRouteSync() {
  const pathname = usePathname()
  const router = useRouter()
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const currentServerId = useAppStore((s) => s.currentServerId)
  
  // Track previous states to avoid infinite push/set loops
  const prevPathnameRef = useRef('')
  const prevViewRef = useRef<AppView | null>(null)
  const prevServerIdRef = useRef<string | null>(null)

  // 1. Sync physical route changes (pathname) back to the Zustand store
  useEffect(() => {
    if (pathname === prevPathnameRef.current) return
    prevPathnameRef.current = pathname

    if (pathname.startsWith('/servers/')) {
      const parts = pathname.split('/')
      const serverId = parts[2]
      if (serverId && serverId !== 'new') {
        if (currentView !== 'server-detail') {
          prevViewRef.current = 'server-detail'
          setCurrentView('server-detail')
        }
        return
      }
    }

    const matchedView = pathToView[pathname]
    if (matchedView && currentView !== matchedView) {
      prevViewRef.current = matchedView
      setCurrentView(matchedView)
    }
  }, [pathname, currentView, setCurrentView])

  return null
}
