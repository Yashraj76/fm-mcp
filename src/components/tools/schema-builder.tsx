'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Trash2, Code, FormInput, Import, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SchemaProperty {
  name: string
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'
  required: boolean
  description: string
  items?: SchemaProperty // for array items
  properties?: SchemaProperty[] // for nested objects
}

export interface JsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
}

interface SchemaBuilderProps {
  value: JsonSchema
  onChange: (schema: JsonSchema) => void
  title?: string
  description?: string
  availableFields?: string[]
}

const TYPE_OPTIONS: SchemaProperty['type'][] = ['string', 'number', 'integer', 'boolean', 'array', 'object']

export function SchemaBuilder({ value, onChange, title = 'Schema', description, availableFields }: SchemaBuilderProps) {
  const [view, setView] = useState<'form' | 'json'>('form')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')

  const properties: SchemaProperty[] = parseProperties(value)

  const handleAddProperty = useCallback(() => {
    const newProp: SchemaProperty = {
      name: `field_${properties.length + 1}`,
      type: 'string',
      required: false,
      description: '',
    }
    const newProperties = [...properties, newProp]
    onChange(buildSchema(newProperties))
  }, [properties, onChange])

  const handleRemoveProperty = useCallback(
    (index: number) => {
      const newProperties = properties.filter((_, i) => i !== index)
      onChange(buildSchema(newProperties))
    },
    [properties, onChange]
  )

  const handlePropertyChange = useCallback(
    (index: number, changes: Partial<SchemaProperty>) => {
      const newProperties = properties.map((prop, i) =>
        i === index ? { ...prop, ...changes } : prop
      )
      onChange(buildSchema(newProperties))
    },
    [properties, onChange]
  )

  const handleSwitchToJson = useCallback(() => {
    setJsonText(JSON.stringify(value, null, 2))
    setJsonError('')
    setView('json')
  }, [value])

  const handleApplyJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText)
      if (parsed.type !== 'object' || !parsed.properties) {
        setJsonError('Schema must have type "object" and "properties"')
        return
      }
      onChange(parsed)
      setJsonError('')
      setView('form')
    } catch {
      setJsonError('Invalid JSON format')
    }
  }, [jsonText, onChange])

  const handleImportSchema = useCallback(() => {
    setJsonText('')
    setJsonError('')
    setView('json')
  }, [])

  const handleExportSchema = useCallback(() => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/\s+/g, '-')}-schema.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [value, title])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{title}</Label>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImportSchema}
            className="h-7 text-xs gap-1"
          >
            <Import className="size-3" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportSchema}
            className="h-7 text-xs gap-1"
          >
            <Download className="size-3" />
            Export
          </Button>
          <Tabs value={view} onValueChange={(v) => v === 'json' ? handleSwitchToJson() : setView('form')}>
            <TabsList className="h-7">
              <TabsTrigger value="form" className="text-xs px-2 h-5 gap-1">
                <FormInput className="size-3" />
                Form
              </TabsTrigger>
              <TabsTrigger value="json" className="text-xs px-2 h-5 gap-1">
                <Code className="size-3" />
                JSON
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {view === 'form' ? (
        <div className="space-y-3">
          {properties.length === 0 ? (
            <div className="text-center py-6 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">No properties defined</p>
              <Button variant="outline" size="sm" onClick={handleAddProperty} className="gap-1">
                <Plus className="size-3" />
                Add First Property
              </Button>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
              {properties.map((prop, index) => (
                <PropertyRow
                  key={`prop-${index}`}
                  property={prop}
                  index={index}
                  onChange={handlePropertyChange}
                  onRemove={handleRemoveProperty}
                  canRemove={properties.length > 1}
                  availableFields={availableFields}
                />
              ))}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddProperty}
            className="w-full gap-1"
          >
            <Plus className="size-3" />
            Add Property
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className={cn(
              'font-mono text-xs min-h-[200px] max-h-[400px]',
              jsonError && 'border-destructive'
            )}
            placeholder='{"type": "object", "properties": {...}, "required": [...]}'
          />
          {jsonError && (
            <p className="text-xs text-destructive">{jsonError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setJsonError('')
                setView('form')
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleApplyJson}>
              Apply Schema
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface PropertyRowProps {
  property: SchemaProperty
  index: number
  onChange: (index: number, changes: Partial<SchemaProperty>) => void
  onRemove: (index: number) => void
  canRemove: boolean
  availableFields?: string[]
}

function PropertyRow({ property, index, onChange, onRemove, canRemove, availableFields }: PropertyRowProps) {
  return (
    <div className="group rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <div className="flex">
              <Input
                value={property.name}
                onChange={(e) => onChange(index, { name: e.target.value })}
                className={cn("h-8 text-xs font-mono", availableFields && availableFields.length > 0 ? "rounded-r-none border-r-0 focus-visible:z-10" : "")}
                placeholder="property_name"
              />
              {availableFields && availableFields.length > 0 && (
                <Select onValueChange={(v) => onChange(index, { name: v })}>
                  <SelectTrigger 
                    className="w-8 h-8 px-0 rounded-l-none bg-muted/20 border-l border-input flex items-center justify-center flex-none focus:ring-0 focus:ring-offset-0 focus:z-10"
                    aria-label="Select layout field"
                  >
                  </SelectTrigger>
                  <SelectContent>
                    {availableFields.map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={property.type}
              onValueChange={(v) => onChange(index, { type: v as SchemaProperty['type'] })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <TypeBadge type={t} />
                      {t}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-1.5 pb-1">
              <Checkbox
                id={`required-${index}`}
                checked={property.required}
                onCheckedChange={(checked) => onChange(index, { required: !!checked })}
                className="size-3.5"
              />
              <Label htmlFor={`required-${index}`} className="text-xs text-muted-foreground">
                Required
              </Label>
            </div>
            {canRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(index)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Input
          value={property.description}
          onChange={(e) => onChange(index, { description: e.target.value })}
          className="h-7 text-xs"
          placeholder="Describe this property..."
        />
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: SchemaProperty['type'] }) {
  const colorMap: Record<string, string> = {
    string: 'bg-green-500/20 text-green-400 border-green-500/30',
    number: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    integer: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    boolean: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    array: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    object: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
  }

  return (
    <Badge variant="outline" className={cn('text-[10px] px-1 py-0', colorMap[type])}>
      {type}
    </Badge>
  )
}

// Helpers
function parseProperties(schema: JsonSchema): SchemaProperty[] {
  if (!schema.properties || typeof schema.properties !== 'object') return []

  return Object.entries(schema.properties).map(([name, prop]) => {
    const p = prop as Record<string, unknown>
    return {
      name,
      type: (p.type as SchemaProperty['type']) || 'string',
      required: Array.isArray(schema.required) && schema.required.includes(name),
      description: (p.description as string) || '',
    }
  })
}

function buildSchema(properties: SchemaProperty[]): JsonSchema {
  const schema: JsonSchema = {
    type: 'object',
    properties: {},
  }

  const required: string[] = []

  for (const prop of properties) {
    const propSchema: Record<string, unknown> = {
      type: prop.type,
    }
    if (prop.description) {
      propSchema.description = prop.description
    }
    schema.properties[prop.name] = propSchema
    if (prop.required) {
      required.push(prop.name)
    }
  }

  if (required.length > 0) {
    schema.required = required
  }

  return schema
}

export function parseJsonSchema(json: string): JsonSchema | null {
  try {
    const parsed = JSON.parse(json)
    if (parsed.type === 'object' && parsed.properties) {
      return parsed as JsonSchema
    }
    return null
  } catch {
    return null
  }
}
