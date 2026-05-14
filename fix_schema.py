import re
import sys

with open('src/components/connections/schema-browser.tsx', 'r') as f:
    content = f.read()

# 1. Start with empty selections
content = content.replace('''      // Auto-select all layouts and scripts
      setSelectedLayouts(new Set(data.data.layouts))
      setSelectedTables(new Set(data.data.odataTables))
      setSelectedScripts(new Set(data.data.scripts))''', '''      // Start with empty selections
      setSelectedLayouts(new Set())
      setSelectedTables(new Set())
      setSelectedScripts(new Set())''')

# 2. Add selectedFields state and toggleField, plus new relation state
state_code = '''  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(new Set())

  // Fields and Relationships
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({})
  const [showAddRelation, setShowAddRelation] = useState(false)
  const [newRelFrom, setNewRelFrom] = useState('')
  const [newRelTo, setNewRelTo] = useState('')
  const [newRelKey, setNewRelKey] = useState('')'''

content = content.replace('''  const [selectedScripts, setSelectedScripts] = useState<Set<string>>(new Set())''', state_code)

toggle_code = '''  function toggleScript(name: string) {
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
  }'''

content = content.replace('''  function toggleScript(name: string) {
    setSelectedScripts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }''', toggle_code)

# 3. Update handleSave
save_code = '''        body: JSON.stringify({
          selectedLayouts: Array.from(selectedLayouts),
          selectedTables: Array.from(selectedTables),
          selectedScripts: Array.from(selectedScripts),
          selectedFields: Object.fromEntries(
            Object.entries(selectedFields).map(([k, v]) => [k, Array.from(v)])
          ),
          relationships,
        }),'''

content = content.replace('''        body: JSON.stringify({
          selectedLayouts: Array.from(selectedLayouts),
          selectedTables: Array.from(selectedTables),
          selectedScripts: Array.from(selectedScripts),
        }),''', save_code)


# 4. Lazy fetch for expanded layouts
expand_code = '''  function toggleExpandLayout(name: string) {
    setExpandedLayouts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
        // Fetch fields lazily if not present
        if (!result?.layoutMeta[name]) {
          fetch(`/api/connections/${connectionId}/layout-fields`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layout: name })
          }).then(res => res.json()).then(data => {
            if (data.success && data.data) {
              setResult(prevRes => {
                if (!prevRes) return prevRes
                return {
                  ...prevRes,
                  layoutMeta: { ...prevRes.layoutMeta, [name]: data.data }
                }
              })
              // Auto-select all fields on first load if layout is selected
              if (selectedLayouts.has(name)) {
                 setSelectedFields(prevF => ({
                   ...prevF,
                   [name]: new Set(data.data.fields)
                 }))
              }
            }
          }).catch(console.error)
        }
      }
      return next
    })
  }'''

content = content.replace('''  function toggleExpandLayout(name: string) {
    setExpandedLayouts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }''', expand_code)

# 5. UI for Fields Checkboxes
fields_ui = '''                      {isExpanded && (
                        <div className="ml-7 mb-1 space-y-0.5">
                          {!meta ? (
                            <p className="text-[10px] text-white/30 px-2 py-0.5 animate-pulse">Loading fields...</p>
                          ) : (
                            <>
                              <div className="flex items-center justify-between px-2 py-0.5 mb-1">
                                <p className="text-[10px] text-white/40">{meta.fields.length} fields</p>
                                <div className="flex gap-1.5">
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedFields(prev => ({...prev, [layout]: new Set(meta.fields)})) }} className="text-[9px] text-blue-400 hover:text-blue-300">All</button>
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedFields(prev => ({...prev, [layout]: new Set()})) }} className="text-[9px] text-white/40 hover:text-white/60">None</button>
                                </div>
                              </div>
                              {meta.fields.map((f) => (
                                <div key={f} className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-pointer ${selectedFields[layout]?.has(f) ? 'bg-blue-500/10 text-white/80' : 'text-white/40 hover:bg-white/5 hover:text-white/60'}`} onClick={() => toggleField(layout, f)}>
                                  <Checkbox
                                    checked={selectedFields[layout]?.has(f) || false}
                                    onCheckedChange={() => toggleField(layout, f)}
                                    className="h-3 w-3 border-white/20 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500 rounded-sm"
                                  />
                                  <span className="text-[10px] truncate">{f}</span>
                                </div>
                              ))}
                              {meta.portals.length > 0 && (
                                <div className="mt-2 pt-1 border-t border-white/5">
                                  <p className="text-[10px] text-white/30 px-2 py-0.5">{meta.portals.length} portals</p>
                                  {meta.portals.map((p) => (
                                    <div key={p} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-purple-400/70">
                                      <GitBranch className="w-2.5 h-2.5 shrink-0" />
                                      {p}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}'''

content = re.sub(r'\{isExpanded && meta && \(\s*<div className="ml-7 mb-1 space-y-0\.5">.*?</p>\s*\)\}\s*</div>\s*\)\}\s*</div>\s*\)', fields_ui, content, flags=re.DOTALL)

# 6. Manual Relationship UI
manual_rel_ui = '''                  {relationships.map((rel, i) => (
                    <div key={i} className="bg-white/3 border border-white/8 rounded-md px-3 py-2 hover:bg-white/5 transition-colors group relative">
                      <button onClick={() => setRelationships(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-2 right-2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><XCircle className="w-3.5 h-3.5" /></button>
                      <div className="flex items-center gap-1.5 text-[11px] text-white/80 mb-1 pr-6">
                        <span className="font-medium text-blue-300 truncate max-w-[35%]" title={rel.from}>{rel.from}</span>
                        <span className="text-white/30 shrink-0">↔</span>
                        <span className="font-medium text-purple-300 truncate max-w-[35%]" title={rel.to}>{rel.to}</span>
                        <Badge className={`ml-auto shrink-0 text-[9px] border ${CONFIDENCE_COLORS[rel.confidence]}`}>{rel.confidence}</Badge>
                      </div>
                      <p className="text-[10px] text-white/35 leading-relaxed">
                        <span className="text-emerald-400/70 font-mono">{rel.key}</span>
                        <span className="mx-1 text-white/20">·</span>
                        {rel.reason}
                      </p>
                    </div>
                  ))}
                  
                  {/* Manual Relationship Form */}
                  {showAddRelation ? (
                    <div className="bg-white/5 border border-purple-500/30 rounded-md p-3 space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                         <div className="flex-1 space-y-1"><p className="text-[10px] text-white/50">From Layout</p><Input value={newRelFrom} onChange={e => setNewRelFrom(e.target.value)} className="h-6 text-[11px] px-2 bg-black/20" /></div>
                         <div className="flex-1 space-y-1"><p className="text-[10px] text-white/50">To Layout</p><Input value={newRelTo} onChange={e => setNewRelTo(e.target.value)} className="h-6 text-[11px] px-2 bg-black/20" /></div>
                      </div>
                      <div className="space-y-1">
                         <p className="text-[10px] text-white/50">Join Key (e.g. CustomerID)</p>
                         <Input value={newRelKey} onChange={e => setNewRelKey(e.target.value)} className="h-6 text-[11px] px-2 bg-black/20" />
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                         <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowAddRelation(false)}>Cancel</Button>
                         <Button size="sm" className="h-6 text-[10px] bg-purple-600 hover:bg-purple-700" onClick={() => {
                            if (!newRelFrom || !newRelTo || !newRelKey) return
                            setRelationships(prev => [...prev, { from: newRelFrom, to: newRelTo, key: newRelKey, confidence: 'high', reason: 'Manually added' }])
                            setShowAddRelation(false)
                            setNewRelFrom('')
                            setNewRelTo('')
                            setNewRelKey('')
                         }}>Add</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setShowAddRelation(true)} className="w-full text-[10px] text-purple-400 border border-dashed border-purple-500/20 hover:bg-purple-500/10 mt-2">
                       + Manually Add Relationship
                    </Button>
                  )}'''

content = re.sub(r'\{relationships\.map\(\(rel, i\) => \(\s*<div key=\{i\}.*?</p>\s*</div>\s*\)\)\}', manual_rel_ui, content, flags=re.DOTALL)


with open('src/components/connections/schema-browser.tsx', 'w') as f:
    f.write(content)

