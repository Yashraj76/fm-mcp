/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

interface FieldMapperProps {
  layoutFields: string[]
  value: Record<string, string>
  onChange: (value: Record<string, string>) => void
}

export function FieldMapper({ layoutFields, value, onChange }: FieldMapperProps) {
  const [entries, setEntries] = useState<{ id: string, key: string, val: string }[]>([])

  useEffect(() => {
    const newEntries = Object.entries(value || {}).map(([k, v]) => ({
      id: Math.random().toString(36).substr(2, 9),
      key: k,
      val: v as string
    }))
    // Only update if lengths differ or keys differ to avoid focus loss
    if (newEntries.length !== entries.length || newEntries.some((e, i) => e.key !== entries[i]?.key || e.val !== entries[i]?.val)) {
      setEntries(newEntries)
    }
  }, [value])

  const updateEntry = (id: string, key: string, val: string) => {
    const newEntries = entries.map(e => e.id === id ? { ...e, key, val } : e)
    setEntries(newEntries)
    
    // Commit to parent
    const newValue: Record<string, string> = {}
    newEntries.forEach(e => {
      if (e.key) newValue[e.key] = e.val
    })
    onChange(newValue)
  }

  const addEntry = () => {
    setEntries([...entries, { id: Math.random().toString(36).substr(2, 9), key: '', val: '' }])
  }

  const removeEntry = (id: string) => {
    const newEntries = entries.filter(e => e.id !== id)
    setEntries(newEntries)
    
    const newValue: Record<string, string> = {}
    newEntries.forEach(e => {
      if (e.key) newValue[e.key] = e.val
    })
    onChange(newValue)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Input Fields Mapping</Label>
        <Button variant="outline" size="sm" onClick={addEntry} className="h-7 text-xs">
          <Plus className="size-3 mr-1" /> Add Mapping
        </Button>
      </div>
      <div className="space-y-2">
        {entries.map(entry => (
          <div key={entry.id} className="flex items-center gap-2">
            <Input 
              value={entry.key}
              onChange={(e) => updateEntry(entry.id, e.target.value, entry.val)}
              placeholder="Input Param"
              className="font-mono text-xs"
              aria-label="Input parameter name"
            />
            <span className="text-muted-foreground text-xs">→</span>
            <Input 
              value={entry.val}
              onChange={(e) => updateEntry(entry.id, entry.key, e.target.value)}
              placeholder="FM Field"
              list="field-list-datalist"
              className="font-mono text-xs"
              aria-label="FileMaker field name"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500" onClick={() => removeEntry(entry.id)} aria-label="Remove mapping">
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>
      <datalist id="field-list-datalist">
        {layoutFields.map(f => <option key={f} value={f} />)}
      </datalist>
    </div>
  )
}
