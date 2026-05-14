import re
import sys

with open('src/components/connections/schema-browser.tsx', 'r') as f:
    content = f.read()

# 1. Fix the Chevron button so it always shows, even if meta is undefined initially.
content = content.replace('''{meta && (
                          <button
                            onClick={() => toggleExpandLayout(layout)}
                            className="text-white/20 hover:text-white/60 shrink-0"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                        )}''', '''                          <button
                            onClick={() => toggleExpandLayout(layout)}
                            className="text-white/20 hover:text-white/60 shrink-0"
                          >
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>''')


# 2. Fix the Manual Relationship form to use dropdowns
# We need to replace the text inputs with <select> or a shadcn <Select> component.
# Using standard <select> with tailwind classes for simplicity and robustness inside the dark theme.

manual_rel_ui_old = '''                  {/* Manual Relationship Form */}
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
                  ) : ('''

manual_rel_ui_new = '''                  {/* Manual Relationship Form */}
                  {showAddRelation ? (
                    <div className="bg-white/5 border border-purple-500/30 rounded-md p-3 space-y-2 mt-2">
                      <div className="flex items-center gap-2">
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-white/50">From Layout</p>
                           <select 
                             value={newRelFrom} 
                             onChange={e => setNewRelFrom(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                           >
                             <option value="">Select Layout...</option>
                             {Array.from(selectedLayouts).map(l => <option key={l} value={l}>{l}</option>)}
                           </select>
                         </div>
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-white/50">To Layout</p>
                           <select 
                             value={newRelTo} 
                             onChange={e => setNewRelTo(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                           >
                             <option value="">Select Layout...</option>
                             {Array.from(selectedLayouts).map(l => <option key={l} value={l}>{l}</option>)}
                           </select>
                         </div>
                      </div>
                      <div className="space-y-1">
                         <p className="text-[10px] text-white/50">Join Key (Shared Field)</p>
                         <select 
                           value={newRelKey} 
                           onChange={e => setNewRelKey(e.target.value)} 
                           className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                           disabled={!newRelFrom || !result?.layoutMeta[newRelFrom]}
                         >
                           <option value="">Select Field...</option>
                           {newRelFrom && result?.layoutMeta[newRelFrom]?.fields?.map(f => <option key={f} value={f}>{f}</option>)}
                         </select>
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
                  ) : ('''

content = content.replace(manual_rel_ui_old, manual_rel_ui_new)


with open('src/components/connections/schema-browser.tsx', 'w') as f:
    f.write(content)

