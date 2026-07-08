'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/utils/api-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Loader2, RefreshCw, Sparkles, Save, ChevronDown, ChevronRight,
  Table2, Layout, FileCode, GitBranch, CheckCircle2, XCircle, Search,
} from 'lucide-react'

interface SchemaBrowserProps {
  connectionId: string
  onClose: () => void
}

interface LayoutMeta {
  fields: string[]
  portals: string[]
  valueLists: any[]
}

interface BrowseResult {
  layouts: string[]
  scripts: string[]
  layoutMeta: Record<string, LayoutMeta>
  odataTables: string[]
  odataMeta: Record<string, { fields: string[] }>
}

interface Relationship {
  from: string
  to: string
  key: string
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  low: 'bg-muted text-muted-foreground border-border',
}

export function SchemaBrowser({ connectionId, onClose }: SchemaBrowserProps) {
  const [phase, setPhase] = useState<'idle' | 'fetching' | 'suggesting' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<BrowseResult | null>(null)
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [error, setError] = useState<string | null>(null)

  // Selections
  const [selectedLayouts, setSelectedLayouts] = useState<Set<string>>(new Set())
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(new Set())

  // Fields and Relationships
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({})
  const [showAddRelation, setShowAddRelation] = useState(false)
  const [newRelFrom, setNewRelFrom] = useState('')
  const [newRelTo, setNewRelTo] = useState('')
  const [newRelKey, setNewRelKey] = useState('')
  const [newRelToKey, setNewRelToKey] = useState('')

  // Expand state
  const [expandedLayouts, setExpandedLayouts] = useState<Set<string>>(new Set())

  // Search filters
  const [layoutSearch, setLayoutSearch] = useState('')
  const [tableSearch, setTableSearch] = useState('')
  const [scriptSearch, setScriptSearch] = useState('')

  // Per-layout field fetch loading state
  const [loadingLayoutFields, setLoadingLayoutFields] = useState<Set<string>>(new Set())

  // Save state
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const fetchSchema = useCallback(async () => {
    setPhase('fetching')
    setError(null)
    setSaved(false)
    try {
      const browseData = await api.post<BrowseResult>(`/api/connections/${connectionId}/browse-schema`)
      setResult(browseData)
      
      try {
        const compData = await api.get<any>(`/api/connections/${connectionId}/schema/compiled`)
        if (compData) {
          const { selectedLayouts, selectedTables, selectedScripts, compiledSchema } = compData
          setSelectedLayouts(new Set(selectedLayouts || []))
          setSelectedTables(new Set(selectedTables || []))
          setSelectedScripts(new Set(selectedScripts || []))
          if (compiledSchema?.relationships) {
            setRelationships(compiledSchema.relationships)
          }
          if (compiledSchema?.layouts) {
             const fields: Record<string, Set<string>> = {}
             compiledSchema.layouts.forEach((l: any) => {
               fields[l.name] = new Set(l.fields || [])
             })
             setSelectedFields(fields)
          }
        } else {
          setSelectedLayouts(new Set())
          setSelectedTables(new Set())
          setSelectedScripts(new Set())
        }
      } catch (e: any) {
        // NOT_BROWSED_YET and SCHEMA_NOT_SAVED are expected on first use — clear
        // selections silently.  Any other code is an unexpected server error.
        const expectedCode = e?.code === 'NOT_BROWSED_YET' || e?.code === 'SCHEMA_NOT_SAVED'
        if (!expectedCode) {
          console.warn('[SchemaBrowser] Unexpected error loading compiled schema:', e?.message || e)
        }
        setSelectedLayouts(new Set())
        setSelectedTables(new Set())
        setSelectedScripts(new Set())
      }
      
      setPhase('done')
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }, [connectionId])

  useEffect(() => {
    queueMicrotask(() => {
      fetchSchema()
    })
  }, [fetchSchema])

  async function fetchAISuggestions() {
    setPhase('suggesting')
    setError(null)
    try {
      // Call the AI inference endpoint
      const data = await api.post<any>(`/api/connections/${connectionId}/infer-relationships`, {
        selectedLayouts: Array.from(selectedLayouts)
      })
      setRelationships(prev => {
        const next = [...prev]
        const rels = data.relationships || [];
        // Dedup using sorted table names so A↔B::key and B↔A::key aren't
        // added twice, while A↔C::key and B↔C::key (different tables, same
        // field name) remain distinct.
        const relKey = (from: string, to: string, key: string) =>
          `${[from, to].sort().join('↔')}::${key}`
        rels.forEach((s: any) => {
          if (!s.from || !s.to || !s.key) return
          if (!next.some(r => relKey(r.from, r.to, r.key) === relKey(s.from, s.to, s.key))) {
            next.push({
              from: s.from,
              to: s.to,
              key: s.key,
              confidence: s.confidence || 'medium',
              reason: s.reason || s.source || 'AI Inferred'
            })
          }
        })
        return next
      })
      setPhase('done')
    } catch (e: any) {
      setError(e.message)
      setPhase('done') // Don't leave in error state — relationships are optional
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/connections/${connectionId}/schema/selections`, {
        selectedLayouts: Array.from(selectedLayouts),
        selectedTables: Array.from(selectedTables),
        selectedScripts: Array.from(selectedScripts),
        selectedFields: Object.fromEntries(
          Object.entries(selectedFields).map(([k, v]) => [k, Array.from(v)])
        ),
        relationships,
      })
      setSaved(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleLayout(name: string) {
    setSelectedLayouts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }
  function toggleTable(name: string) {
    setSelectedTables((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }
  function toggleScript(name: string) {
    setSelectedScripts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  function toggleField(layout: string, field: string) {
    setSelectedFields((prev) => {
      const next = { ...prev }
      if (!next[layout]) next[layout] = new Set()
      const layoutFields = new Set(next[layout])
      if (layoutFields.has(field)) layoutFields.delete(field)
      else layoutFields.add(field)
      next[layout] = layoutFields
      return next
    })
  }
  function toggleExpandLayout(name: string) {
    setExpandedLayouts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
        // Fetch fields lazily if not present
        if (!result?.layoutMeta[name]) {
          setLoadingLayoutFields(prevL => new Set([...prevL, name]))
          api.post<any>(`/api/connections/${connectionId}/layout-fields`, { layout: name })
            .then(data => {
              if (data) {
                setResult(prevRes => {
                  if (!prevRes) return prevRes
                  return {
                    ...prevRes,
                    layoutMeta: { ...prevRes.layoutMeta, [name]: data }
                  }
                })
                if (selectedLayouts.has(name)) {
                   setSelectedFields(prevF => ({
                     ...prevF,
                     [name]: new Set(data.fields)
                   }))
                }
              }
            })
            .catch(console.error)
            .finally(() => {
              setLoadingLayoutFields(prevL => {
                const next = new Set(prevL)
                next.delete(name)
                return next
              })
            })
        }
      }
      return next
    })
  }

  const isWorking = phase === 'fetching' || phase === 'suggesting'
  const filteredLayouts = result?.layouts.filter((l) => l.toLowerCase().includes(layoutSearch.toLowerCase())) || []
  const filteredTables = result?.odataTables.filter((t) => t.toLowerCase().includes(tableSearch.toLowerCase())) || []
  const filteredScripts = result?.scripts.filter((s) => s.toLowerCase().includes(scriptSearch.toLowerCase())) || []

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-6 pb-6 px-4">
      <div className="w-full max-w-[95vw] h-[95vh] bg-background border rounded-2xl shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Layout className="w-4 h-4 text-blue-400" />
              Schema Browser
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-blue-400">Layouts</span> come from the FileMaker Data API.{' '}
              <span className="text-purple-400">OData Tables</span> come from the OData 4.0 endpoint and are optional.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchSchema}
              disabled={isWorking}
              className="text-muted-foreground hover:text-foreground h-8"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${phase === 'fetching' ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchAISuggestions}
              disabled={isWorking || !result || selectedLayouts.size === 0}
              className="text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 h-8"
            >
              {phase === 'suggesting'
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <GitBranch className="w-3.5 h-3.5 mr-1.5" />}
              {phase === 'suggesting' ? 'Detecting…' : `Detect Relationships${selectedLayouts.size > 0 ? ` (${selectedLayouts.size})` : ''}`}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || isWorking || !result || (selectedLayouts.size === 0 && selectedTables.size === 0)}
              title={selectedLayouts.size === 0 && selectedTables.size === 0 ? 'Select at least one layout or OData table before saving' : undefined}
              className="bg-blue-600 hover:bg-blue-700 h-8"
            >
              {saving
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : saved
                ? <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                : <Save className="w-3.5 h-3.5 mr-1.5" />}
              {saved ? 'Saved!' : 'Save Selections'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="text-muted-foreground hover:text-foreground h-8">✕</Button>
          </div>
        </div>

        {/* Loading State */}
        {phase === 'fetching' && (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-muted-foreground text-sm">
              Fetching schema from FileMaker…
            </p>
          </div>
        )}

        {/* Error State */}
        {phase === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-4">
            <XCircle className="w-8 h-8 text-red-400" />
            <p className="text-red-300 text-sm">{error}</p>
            <Button size="sm" onClick={fetchSchema} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" /> Retry
            </Button>
          </div>
        )}

        {/* Main content — 3-column layout */}
        {(phase === 'done' || phase === 'suggesting') && result && (
          <div className="flex-1 overflow-hidden flex">

            {/* ── Layouts ── */}
            <div className="w-2/5 border-r flex flex-col">
              <div className="px-4 py-3 border-b shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Layout className="w-4 h-4 text-blue-400" /> Layouts
                    <span className="text-[9px] text-blue-400/60 font-normal normal-case tracking-normal">Data API</span>
                    <Badge className="ml-1 bg-muted text-muted-foreground border-none text-xs">{selectedLayouts.size}/{result.layouts.length}</Badge>
                  </span>
                  <div className="flex gap-1.5">
                    <button onClick={() => setSelectedLayouts(new Set(result.layouts))} className="text-xs text-blue-400 hover:text-blue-300">All</button>
                    <span className="text-muted-foreground/30">·</span>
                    <button onClick={() => setSelectedLayouts(new Set())} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                  </div>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter layouts…"
                    value={layoutSearch}
                    onChange={(e) => setLayoutSearch(e.target.value)}
                    className="pl-8 h-7 text-xs"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {result.layouts.length === 0 ? (
                  <div className="flex flex-col items-center text-center px-4 py-8 gap-2">
                    <Layout className="w-6 h-6 text-muted-foreground/30 mb-1" />
                    <p className="text-[11px] text-muted-foreground font-medium">No layouts found</p>
                    <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                      Check that the FileMaker file is open, the Data API is enabled in FileMaker Server Admin Console, and this account has access to at least one layout.
                    </p>
                  </div>
                ) : filteredLayouts.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center pt-6 px-2">
                    No layouts match &ldquo;{layoutSearch}&rdquo;
                  </p>
                ) : null}
                {filteredLayouts.map((layout) => {
                  const meta = result.layoutMeta[layout]
                  const isExpanded = expandedLayouts.has(layout)
                  const isSelected = selectedLayouts.has(layout)
                  const isLoadingFields = loadingLayoutFields.has(layout)
                  return (
                    <div key={layout}>
                      <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group transition-colors ${isSelected ? 'bg-blue-500/10' : 'hover:bg-muted'}`}>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleLayout(layout)}
                          className="h-4 w-4 border-white/30 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                        />
                        <span
                          className="flex-1 text-sm truncate cursor-pointer"
                          onClick={() => toggleLayout(layout)}
                        >{layout}</span>
                                                  <button
                            onClick={() => toggleExpandLayout(layout)}
                            className="text-muted-foreground/40 hover:text-muted-foreground shrink-0"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                      </div>
                      {isExpanded && (
                        <div className="ml-7 mb-1 space-y-0.5">
                          {!meta ? (
                            <p className="text-[10px] text-muted-foreground/50 px-2 py-1 flex items-center gap-1.5">
                              {isLoadingFields
                                ? <><Loader2 className="w-3 h-3 animate-spin shrink-0" /> Loading fields…</>
                                : <span className="text-muted-foreground/40">Expand to load fields</span>}
                            </p>
                          ) : (
                            <>
                              <div className="flex items-center justify-between px-2 py-0.5 mb-1">
                                <p className="text-xs text-muted-foreground">{meta.fields.length} fields</p>
                                <div className="flex gap-1.5">
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedFields(prev => ({...prev, [layout]: new Set(meta.fields)})) }} className="text-xs text-blue-400 hover:text-blue-300">All</button>
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedFields(prev => ({...prev, [layout]: new Set()})) }} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                                </div>
                              </div>
                              {meta.fields.map((f: string) => (
                                <div key={f} className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer ${selectedFields[layout]?.has(f) ? 'bg-blue-500/10' : 'hover:bg-muted'}`} onClick={() => toggleField(layout, f)}>
                                  <Checkbox
                                    checked={selectedFields[layout]?.has(f) || false}
                                    onCheckedChange={() => toggleField(layout, f)}
                                    className="h-3 w-3 border-white/20 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 rounded-sm"
                                  />
                                  <span className="text-[10px] truncate">{f}</span>
                                </div>
                              ))}
                              {meta.portals.length > 0 && (
                                <div className="mt-2 pt-1 border-t">
                                  <p className="text-xs text-muted-foreground px-2 py-0.5">{meta.portals.length} portals</p>
                                  {meta.portals.map((p: string) => (
                                    <div key={p} className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-purple-400/70">
                                      <GitBranch className="w-3 h-3 shrink-0" />
                                      {p}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── OData Tables ── */}
            <div className="w-1/5 border-r flex flex-col">
              <div className="px-4 py-3 border-b shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Table2 className="w-4 h-4 text-purple-400" /> OData Tables
                    <span className="text-[9px] text-purple-400/60 font-normal normal-case tracking-normal">OData 4.0</span>
                    <Badge className="ml-1 bg-muted text-muted-foreground border-none text-xs">{selectedTables.size}/{result.odataTables.length}</Badge>
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Filter…"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    className="pl-8 h-7 text-xs"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {result.odataTables.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center px-3">
                    <Table2 className="w-5 h-5 text-muted-foreground/30 mb-2" />
                    <p className="text-[11px] text-muted-foreground font-medium mb-1">OData not available</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      No OData tables were found for this connection. OData is optional — layouts are sufficient for tool generation.
                    </p>
                  </div>
                ) : filteredTables.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center pt-6 px-2">
                    No tables match &ldquo;{tableSearch}&rdquo;
                  </p>
                ) : null}
                {filteredTables.map((table) => (
                  <div
                    key={table}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedTables.has(table) ? 'bg-purple-500/10' : 'hover:bg-muted'}`}
                    onClick={() => toggleTable(table)}
                  >
                    <Checkbox
                      checked={selectedTables.has(table)}
                      onCheckedChange={() => toggleTable(table)}
                      className="h-4 w-4 border-white/30 data-[state=checked]:bg-purple-500 data-[state=checked]:border-purple-500"
                    />
                    <span className="flex-1 text-sm truncate">{table}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Scripts + Relationships ── */}
            <div className="flex-1 flex flex-col">
              {/* Scripts */}
              <div className="border-b flex flex-col" style={{ maxHeight: '45%' }}>
                <div className="px-4 py-3 border-b shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <FileCode className="w-4 h-4" /> Scripts
                      <Badge className="ml-1 bg-muted text-muted-foreground border-none text-xs">{selectedScripts.size}/{result.scripts.length}</Badge>
                    </span>
                    <div className="flex gap-1.5">
                      <button onClick={() => setSelectedScripts(new Set(result.scripts))} className="text-xs text-blue-400 hover:text-blue-300">All</button>
                      <span className="text-muted-foreground/30">·</span>
                      <button onClick={() => setSelectedScripts(new Set())} className="text-xs text-muted-foreground hover:text-foreground">None</button>
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Filter scripts…"
                      value={scriptSearch}
                      onChange={(e) => setScriptSearch(e.target.value)}
                      className="pl-8 h-7 text-xs"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {filteredScripts.length === 0 && (
                    <p className="text-[11px] text-muted-foreground text-center pt-4">No scripts</p>
                  )}
                  {filteredScripts.map((script) => (
                    <div
                      key={script}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedScripts.has(script) ? 'bg-amber-500/10' : 'hover:bg-muted'}`}
                      onClick={() => toggleScript(script)}
                    >
                      <Checkbox
                        checked={selectedScripts.has(script)}
                        onCheckedChange={() => toggleScript(script)}
                        className="h-4 w-4 border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      />
                      <span className="flex-1 text-sm truncate">{script}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Relationships */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-3 border-b shrink-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <GitBranch className="w-4 h-4 text-purple-400" /> Relationships
                      <Badge className="ml-1 bg-purple-500/20 text-purple-400 border-none text-xs">{relationships.length}</Badge>
                    </span>
                    <button
                      onClick={fetchAISuggestions}
                      disabled={phase === 'suggesting' || selectedLayouts.size === 0}
                      className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-40"
                    >
                      <GitBranch className="w-3 h-3" /> {relationships.length > 0 ? 'Re-detect' : 'Detect'}
                    </button>
                  </div>
                  {relationships.length > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      {(['high', 'medium', 'low'] as const).map((c) => {
                        const count = relationships.filter((r) => r.confidence === c).length
                        if (count === 0) return null
                        return (
                          <span key={c} className={`text-[10px] px-1.5 py-0.5 rounded border ${CONFIDENCE_COLORS[c]}`}>
                            {count} {c}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {relationships.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                      <GitBranch className="w-5 h-5 text-purple-400/40 mb-2" />
                      <p className="text-[11px] text-muted-foreground font-medium mb-1">No relationships detected yet</p>
                      <p className="text-[10px] text-muted-foreground/50">Select layouts then click "Detect" to find joins via field name patterns and portals</p>
                    </div>
                  )}
                                    {relationships.map((rel, i) => (
                    <div key={i} className="bg-muted/50 border rounded-md px-3 py-2 hover:bg-muted transition-colors group relative">
                      <button onClick={() => setRelationships(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-2 right-2 text-muted-foreground/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><XCircle className="w-3.5 h-3.5" /></button>
                      <div className="flex items-center gap-1.5 text-[11px] mb-1 pr-6">
                        <span className="font-medium text-blue-300 truncate max-w-[35%]" title={rel.from}>{rel.from}</span>
                        <span className="text-muted-foreground/40 shrink-0">↔</span>
                        <span className="font-medium text-purple-300 truncate max-w-[35%]" title={rel.to}>{rel.to}</span>
                        <Badge className={`ml-auto shrink-0 text-[9px] border ${CONFIDENCE_COLORS[rel.confidence]}`}>{rel.confidence}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                        <span className="text-emerald-400/70 font-mono">{rel.key}</span>
                        <span className="mx-1 text-muted-foreground/30">·</span>
                        {rel.reason}
                      </p>
                    </div>
                  ))}
                  
                  {/* Manual Relationship Form */}
                  {showAddRelation ? (
                    <div className="bg-muted border border-purple-500/30 rounded-md p-3 space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-muted-foreground">From Layout</p>
                           <select 
                             value={newRelFrom} 
                             onChange={e => {
                               const val = e.target.value
                               setNewRelFrom(val)
                               if (val && !result?.layoutMeta[val]) toggleExpandLayout(val)
                             }} 
                             className="w-full h-6 text-[11px] px-1 bg-background border rounded text-foreground"
                           >
                             <option value="">Select Layout...</option>
                             {Array.from(selectedLayouts).map(l => <option key={l} value={l}>{l}</option>)}
                           </select>
                         </div>
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-muted-foreground">To Layout</p>
                           <select 
                             value={newRelTo} 
                             onChange={e => {
                               const val = e.target.value
                               setNewRelTo(val)
                               if (val && !result?.layoutMeta[val]) toggleExpandLayout(val)
                             }} 
                             className="w-full h-6 text-[11px] px-1 bg-background border rounded text-foreground"
                           >
                             <option value="">Select Layout...</option>
                             {Array.from(selectedLayouts).map(l => <option key={l} value={l}>{l}</option>)}
                           </select>
                         </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-muted-foreground">From Field</p>
                           <select 
                             value={newRelKey} 
                             onChange={e => setNewRelKey(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-background border rounded text-foreground disabled:opacity-50"
                           >
                             <option value="">Select Field...</option>
                             {newRelFrom && result?.layoutMeta[newRelFrom]?.fields?.map((f: string) => <option key={f} value={f}>{f}</option>)}
                           </select>
                         </div>
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-muted-foreground">To Field</p>
                           <select 
                             value={newRelToKey} 
                             onChange={e => setNewRelToKey(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-background border rounded text-foreground disabled:opacity-50"
                           >
                             <option value="">Select Field...</option>
                             {newRelTo && result?.layoutMeta[newRelTo]?.fields?.map((f: string) => <option key={f} value={f}>{f}</option>)}
                           </select>
                         </div>
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                         <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowAddRelation(false)}>Cancel</Button>
                         <Button size="sm" className="h-6 text-[10px] bg-purple-600 hover:bg-purple-700" onClick={() => {
                            if (!newRelFrom || !newRelTo || !newRelKey || !newRelToKey) return
                            const combinedKey = newRelKey === newRelToKey ? newRelKey : `${newRelKey}=${newRelToKey}`
                            setRelationships(prev => [...prev, { from: newRelFrom, to: newRelTo, key: combinedKey, confidence: 'high', reason: 'Manually added' }])
                            setShowAddRelation(false)
                            setNewRelFrom('')
                            setNewRelTo('')
                            setNewRelKey('')
                            setNewRelToKey('')
                         }}>Add</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setShowAddRelation(true)} className="w-full text-[10px] text-purple-400 border border-dashed border-purple-500/20 hover:bg-purple-500/10 mt-2">
                       + Manually Add Relationship
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {phase === 'done' && result && (
          <div className="px-6 py-3 border-t flex items-center justify-between text-[11px] text-muted-foreground shrink-0">
            <span>
              {selectedLayouts.size} layouts · {selectedTables.size} tables · {selectedScripts.size} scripts · {relationships.length} relationships
            </span>
            {error && <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />{error}</span>}
            {!error && selectedLayouts.size === 0 && selectedTables.size === 0 && (
              <span className="text-amber-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                Select at least one layout or OData table to enable saving
              </span>
            )}
            {saved && <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Compiled schema saved — ready for tool generation</span>}
          </div>
        )}
      </div>
    </div>
  )
}
