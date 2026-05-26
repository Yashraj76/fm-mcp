'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/utils/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Database, Loader2, CheckCircle2, XCircle, RefreshCw, Search, Eye, EyeOff, ArrowRight } from 'lucide-react'

interface DatabasePickerProps {
  isOpen: boolean
  onClose: () => void
  serverId: string
  serverName: string
  serverHost: string
  onCreateConnection: (dbName: string) => void
}

export function DatabasePicker({ isOpen, onClose, serverId, serverName, serverHost, onCreateConnection }: DatabasePickerProps) {
  const [databases, setDatabases] = useState<{ id: string; name: string; status: string; hasConnection: boolean }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<string | null>(null)

  // Form for file credentials
  const [selectedDb, setSelectedDb] = useState<string | null>(null)
  const [fileUser, setFileUser] = useState('')
  const [filePass, setFilePass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [connectionName, setConnectionName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const loadDatabases = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const dbs = await api.get<any[]>(`/api/server-connections/${serverId}/databases`)
      setDatabases(dbs)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        loadDatabases()
      })
    }
  }, [isOpen, loadDatabases])

  const filtered = databases.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))

  function pickDb(name: string) {
    setSelectedDb(name)
    setConnectionName(name)
    setSaveError(null)
    setTestResult(null)
  }

  async function handleCreate() {
    if (!selectedDb || !fileUser || !filePass) {
      setSaveError('Username and password are required.')
      return
    }
    setCreating(selectedDb)
    setSaveError(null)
    setTestResult(null)
    try {
      await api.post('/api/connections', {
        name: connectionName || selectedDb,
        host: serverHost,
        port: 443,
        database: selectedDb,
        username: fileUser,
        password: filePass,
        serverConnectionId: serverId,
        sslVerify: true,
      })
      onCreateConnection(selectedDb)
      onClose()
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setCreating(null)
    }
  }

  async function handleTestAndCreate() {
    if (!selectedDb || !fileUser || !filePass) {
      setSaveError('Username and password are required.')
      return
    }
    setTesting(true)
    setSaveError(null)
    setTestResult(null)
    try {
      const conn = await api.post<any>('/api/connections', {
        name: connectionName || selectedDb,
        host: serverHost,
        port: 443,
        database: selectedDb,
        username: fileUser,
        password: filePass,
        serverConnectionId: serverId,
        sslVerify: true,
      })

      try {
        await api.post(`/api/connections/${conn.id}/test`)
        setTestResult({ ok: true, msg: `Connected successfully` })
        onCreateConnection(selectedDb)
        onClose()
      } catch (testErr: any) {
        await api.delete(`/api/connections/${conn.id}`)
        setTestResult({ ok: false, msg: testErr.message || 'Connection failed' })
      }
    } catch (e: any) {
      setSaveError(e.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0f1117] border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Database className="w-5 h-5 text-purple-400" />
            Pick a Database — {serverName}
          </DialogTitle>
          <p className="text-sm text-white/50">{serverHost} · {databases.length} databases available</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input
              placeholder="Search databases..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9"
            />
          </div>

          {/* Database list */}
          <div className="max-h-[50vh] min-h-[300px] overflow-y-auto space-y-1.5 rounded-lg border border-white/10 p-2">
            {loading && (
              <div className="flex items-center justify-center py-8 text-white/40">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading databases...
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm py-4 px-2">
                <XCircle className="w-4 h-4" /> {error}
                <Button size="sm" variant="ghost" onClick={loadDatabases} className="ml-auto text-white/40">
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <p className="text-white/30 text-sm text-center py-6">No databases found</p>
            )}
            {filtered.map((db) => (
              <button
                key={db.name}
                onClick={() => !db.hasConnection && pickDb(db.name)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all text-sm ${
                  selectedDb === db.name
                    ? 'bg-purple-500/20 border border-purple-500/40'
                    : db.hasConnection
                    ? 'opacity-50 cursor-not-allowed bg-white/3'
                    : 'bg-white/3 hover:bg-white/8 border border-transparent cursor-pointer'
                }`}
              >
                <Database className={`w-4 h-4 shrink-0 ${selectedDb === db.name ? 'text-purple-400' : 'text-white/40'}`} />
                <span className="flex-1 font-medium text-white/90">{db.name}</span>
                {db.hasConnection ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Connected</Badge>
                ) : (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Available</Badge>
                )}
              </button>
            ))}
          </div>

          {/* File credentials form — shown when a DB is selected */}
          {selectedDb && (
            <div className="border border-white/10 rounded-lg p-4 space-y-3 bg-white/3">
              <p className="text-sm font-medium text-white/80 flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-purple-400" />
                File credentials for <span className="text-purple-300">{selectedDb}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-white/60 text-xs">Connection Name</Label>
                <Input
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white h-9 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">FM Username *</Label>
                  <Input
                    value={fileUser}
                    onChange={(e) => setFileUser(e.target.value)}
                    placeholder="Admin"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">FM Password *</Label>
                  <div className="relative">
                    <Input
                      type={showPass ? 'text' : 'password'}
                      value={filePass}
                      onChange={(e) => setFilePass(e.target.value)}
                      placeholder="••••••••"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9 text-sm pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                    >
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
              {saveError && (
                <p className="text-red-400 text-xs flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" /> {saveError}
                </p>
              )}
              {testResult && (
                <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${
                  testResult.ok
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : 'text-red-400 bg-red-500/10 border-red-500/20'
                }`}>
                  {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4 shrink-0" />}
                  <span className="truncate">{testResult.msg}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button
                  variant="outline"
                  onClick={handleTestAndCreate}
                  disabled={!!creating || testing}
                  className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 h-9 px-2 text-sm"
                >
                  {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Test & Create
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!!creating || testing}
                  className="bg-purple-600 hover:bg-purple-700 h-9 px-2 text-sm"
                >
                  {creating === selectedDb && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
