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
  editingConnectionId: string | null
  editingServerId: string | null
  editingToolId: string | null
  // Known up-front from the page that opened the dialog (its own server/tool
  // list already has this) — lets ToolDialog start the compiled-schema fetch
  // immediately instead of waiting on its own heavy server-detail fetch.
  toolDialogConnectionId: string | null
  // Pre-fills a fresh (non-editing) ToolDialog — used by the AI tool review
  // queue below to open the dialog already populated with a generated tool.
  toolDialogPrefilledData: Record<string, unknown> | null
  // Remaining AI-generated tools still to review, one ToolDialog session at a
  // time. ToolDialog pops the next entry when the current session closes.
  aiReviewQueue: { prefilledData: Record<string, unknown>; connectionId: string | null }[]
  setShowConnectionDialog: (show: boolean, id?: string | null) => void
  setShowServerDialog: (show: boolean, id?: string | null) => void
  setShowBranchDialog: (show: boolean) => void
  setShowToolDialog: (
    show: boolean,
    id?: string | null,
    connectionId?: string | null,
    prefilledData?: Record<string, unknown> | null
  ) => void
  setShowConfigDialog: (show: boolean) => void
  setAiReviewQueue: (items: { prefilledData: Record<string, unknown>; connectionId: string | null }[]) => void


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
      // currentBranchId is only meaningful scoped to currentServerId — persisted
      // across navigations, so switching servers must reset it. Otherwise a
      // branch id left over from a previously viewed server (which may not
      // even exist on the new one) stays selected, and pages that only
      // auto-default the branch "if unset" never correct it.
      setCurrentServer: (id) => set((state) =>
        id === state.currentServerId ? {} : { currentServerId: id, currentBranchId: null }
      ),
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
      editingConnectionId: null,
      editingServerId: null,
      editingToolId: null,
      toolDialogConnectionId: null,
      toolDialogPrefilledData: null,
      aiReviewQueue: [],
      setShowConnectionDialog: (show, id = null) => set({ showConnectionDialog: show, editingConnectionId: id }),
      setShowServerDialog: (show, id = null) => set({ showServerDialog: show, editingServerId: id }),
      setShowBranchDialog: (show) => set({ showBranchDialog: show }),
      setShowToolDialog: (show, id = null, connectionId = null, prefilledData = null) =>
        set({ showToolDialog: show, editingToolId: id, toolDialogConnectionId: connectionId, toolDialogPrefilledData: prefilledData }),
      setShowConfigDialog: (show) => set({ showConfigDialog: show }),
      setAiReviewQueue: (items) => set({ aiReviewQueue: items }),


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
