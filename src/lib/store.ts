'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============ NAVIGATION ============
export type AppView = 
  | 'dashboard' 
  | 'connections' 
  | 'servers' 
  | 'server-detail'
  | 'branches' 
  | 'tools' 
  | 'playground' 
  | 'deployments' 
  | 'settings'

interface AppState {
  // Navigation
  currentView: AppView
  currentServerId: string | null
  currentBranchId: string | null
  sidebarOpen: boolean
  setCurrentView: (view: AppView) => void
  setCurrentServer: (id: string | null) => void
  setCurrentBranch: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void

  // Server Mode
  serverMode: 'edit' | 'staging' | 'deployed'
  setServerMode: (mode: 'edit' | 'staging' | 'deployed') => void

  // Dialogs
  showConnectionDialog: boolean
  showServerDialog: boolean
  showBranchDialog: boolean
  showToolDialog: boolean
  showConfigDialog: boolean
  showAiDialog: boolean
  editingConnectionId: string | null
  editingServerId: string | null
  editingToolId: string | null
  setShowConnectionDialog: (show: boolean, id?: string | null) => void
  setShowServerDialog: (show: boolean, id?: string | null) => void
  setShowBranchDialog: (show: boolean) => void
  setShowToolDialog: (show: boolean, id?: string | null) => void
  setShowConfigDialog: (show: boolean) => void
  setShowAiDialog: (show: boolean) => void

  // Data refresh triggers
  refreshConnections: number
  refreshServers: number
  refreshBranches: number
  refreshTools: number
  refreshDeployments: number
  triggerRefreshConnections: () => void
  triggerRefreshServers: () => void
  triggerRefreshBranches: () => void
  triggerRefreshTools: () => void
  triggerRefreshDeployments: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Navigation
      currentView: 'dashboard',
      currentServerId: null,
      currentBranchId: null,
      sidebarOpen: true,
      setCurrentView: (view) => set({ currentView: view }),
      setCurrentServer: (id) => set({ currentServerId: id }),
      setCurrentBranch: (id) => set({ currentBranchId: id }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Server Mode
      serverMode: 'edit',
      setServerMode: (mode) => set({ serverMode: mode }),

      // Dialogs
      showConnectionDialog: false,
      showServerDialog: false,
      showBranchDialog: false,
      showToolDialog: false,
      showConfigDialog: false,
      showAiDialog: false,
      editingConnectionId: null,
      editingServerId: null,
      editingToolId: null,
      setShowConnectionDialog: (show, id = null) => set({ showConnectionDialog: show, editingConnectionId: id }),
      setShowServerDialog: (show, id = null) => set({ showServerDialog: show, editingServerId: id }),
      setShowBranchDialog: (show) => set({ showBranchDialog: show }),
      setShowToolDialog: (show, id = null) => set({ showToolDialog: show, editingToolId: id }),
      setShowConfigDialog: (show) => set({ showConfigDialog: show }),
      setShowAiDialog: (show) => set({ showAiDialog: show }),

      // Refresh triggers
      refreshConnections: 0,
      refreshServers: 0,
      refreshBranches: 0,
      refreshTools: 0,
      refreshDeployments: 0,
      triggerRefreshConnections: () => set((s) => ({ refreshConnections: s.refreshConnections + 1 })),
      triggerRefreshServers: () => set((s) => ({ refreshServers: s.refreshServers + 1 })),
      triggerRefreshBranches: () => set((s) => ({ refreshBranches: s.refreshBranches + 1 })),
      triggerRefreshTools: () => set((s) => ({ refreshTools: s.refreshTools + 1 })),
      triggerRefreshDeployments: () => set((s) => ({ refreshDeployments: s.refreshDeployments + 1 })),
    }),
    {
      name: 'mcp-platform-store',
      partialize: (state) => ({
        currentView: state.currentView,
        currentServerId: state.currentServerId,
        currentBranchId: state.currentBranchId,
        sidebarOpen: state.sidebarOpen,
        serverMode: state.serverMode,
        // NOTE: Dialog states are intentionally NOT persisted — they always start closed
      }),
    }
  )
)
