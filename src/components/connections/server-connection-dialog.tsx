/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/utils/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Server, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react'

interface ServerConnectionDialogProps {
  isOpen: boolean
  onClose: () => void
  onSaved: (server: any) => void
  existingServer?: any
}

export function ServerConnectionDialog({ isOpen, onClose, onSaved, existingServer }: ServerConnectionDialogProps) {
  const isEditing = !!existingServer

  const [form, setForm] = useState({
    name: '',
    host: '',
    port: 443,
    adminUsername: '',
    adminPassword: '',
    sslVerify: true,
  })
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setForm({
        name: existingServer?.name || '',
        host: existingServer?.host || '',
        port: existingServer?.port ?? 443,
        adminUsername: existingServer?.adminUsername || '',
        adminPassword: '',
        sslVerify: existingServer?.sslVerify ?? true,
      })
      setShowPw(false)
      setSaving(false)
      setTesting(false)
      setTestResult(null)
      setError(null)
    }
  }, [isOpen, existingServer])

  function set(key: string, val: any) {
    setForm((prev) => ({ ...prev, [key]: val }))
    setTestResult(null)
  }

  async function handleTest() {
    if (!form.host || !form.adminUsername || !form.adminPassword) {
      setError('Fill in host, username, and password to test.')
      return
    }
    setTesting(true); setError(null); setTestResult(null)
    try {
      // Quick save-then-test approach, or test inline via a temp API
      const serverConn = await api.post<any>('/api/server-connections', { ...form })

      try {
        const testData = await api.post<any>(`/api/server-connections/${serverConn.id}/test`)
        setTestResult({ ok: true, msg: `Connected in ${testData.duration}ms` })
        onSaved(serverConn)
        onClose()
      } catch (testErr: any) {
        // Delete the temp server
        await api.delete(`/api/server-connections/${serverConn.id}`)
        setTestResult({ ok: false, msg: testErr.message || 'Connection test failed' })
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setError(null)
    if (!form.name || !form.host || !form.adminUsername) {
      setError('Name, host, and username are required.')
      return
    }
    if (!isEditing && !form.adminPassword) {
      setError('Password is required.')
      return
    }
    setSaving(true)
    try {
      const savedServer = isEditing 
        ? await api.put<any>(`/api/server-connections/${existingServer.id}`, form)
        : await api.post<any>('/api/server-connections', form)
      onSaved(savedServer)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-[#0f1117] border border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Server className="w-5 h-5 text-blue-400" />
            {isEditing ? 'Edit FM Server' : 'Add FM Server'}
          </DialogTitle>
          <p className="text-sm text-white/50 mt-1">
            Admin credentials for listing hosted databases. Not used for record-level access.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-white/80 text-xs">Server Name *</Label>
            <Input
              id="sc-name"
              placeholder="e.g. Production FM Server"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-white/80 text-xs">Host / IP *</Label>
              <Input
                id="sc-host"
                placeholder="192.168.1.100 or fm.example.com"
                value={form.host}
                onChange={(e) => set('host', e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-white/80 text-xs">Port</Label>
              <Input
                id="sc-port"
                type="number"
                value={form.port}
                onChange={(e) => set('port', parseInt(e.target.value) || 443)}
                className="bg-white/5 border-white/10 text-white h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/80 text-xs">Admin Username *</Label>
            <Input
              id="sc-user"
              placeholder="Admin"
              value={form.adminUsername}
              onChange={(e) => set('adminUsername', e.target.value)}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/80 text-xs">Admin Password {isEditing ? '(leave blank to keep current)' : '*'}</Label>
            <div className="relative">
              <Input
                id="sc-pw"
                type={showPw ? 'text' : 'password'}
                placeholder={isEditing ? '••••••••' : 'Enter admin password'}
                value={form.adminPassword}
                onChange={(e) => set('adminPassword', e.target.value)}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Switch
              id="sc-ssl"
              checked={form.sslVerify}
              onCheckedChange={(v) => set('sslVerify', v)}
            />
            <Label htmlFor="sc-ssl" className="text-white/70 text-sm cursor-pointer">Verify SSL Certificate</Label>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <XCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {testResult && (
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${
              testResult.ok
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-red-400 bg-red-500/10 border-red-500/20'
            }`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {testResult.msg}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white">
            Cancel
          </Button>
          {!isEditing && (
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={testing || saving}
              className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              {testing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Test & Save
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={saving || testing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? 'Update Server' : 'Save Server'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
