import re

with open('src/components/connections/schema-browser.tsx', 'r') as f:
    content = f.read()

# 1. Replace the old `isExpanded && meta &&` block with the new `isExpanded &&` block that handles loading state and checkboxes
old_expand_block = '''                      {isExpanded && meta && (
                        <div className="ml-7 mb-1 space-y-0.5">
                          <p className="text-[10px] text-white/30 px-2 py-0.5">{meta.fields.length} fields{meta.portals.length > 0 ? ` · ${meta.portals.length} portals` : ''}</p>
                          {meta.fields.slice(0, 12).map((f) => (
                            <div key={f} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-white/40">
                              <div className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                              {f}
                            </div>
                          ))}
                          {meta.fields.length > 12 && (
                            <p className="text-[10px] text-white/25 px-2">+{meta.fields.length - 12} more…</p>
                          )}
                          {meta.portals.map((p) => (
                            <div key={p} className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] text-purple-400/70">
                              <GitBranch className="w-2.5 h-2.5 shrink-0" />
                              {p}
                            </div>
                          ))}
                        </div>
                      )}'''

new_expand_block = '''                      {isExpanded && (
                        <div className="ml-7 mb-1 space-y-0.5">
                          {!meta ? (
                            <p className="text-[10px] text-white/30 px-2 py-0.5 flex items-center gap-1.5 animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading fields...
                            </p>
                          ) : (
                            <>
                              <div className="flex items-center justify-between px-2 py-0.5 mb-1">
                                <p className="text-[10px] text-white/40">{meta.fields.length} fields</p>
                                <div className="flex gap-1.5">
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedFields(prev => ({...prev, [layout]: new Set(meta.fields)})) }} className="text-[9px] text-blue-400 hover:text-blue-300">All</button>
                                  <button onClick={(e) => { e.stopPropagation(); setSelectedFields(prev => ({...prev, [layout]: new Set()})) }} className="text-[9px] text-white/40 hover:text-white/60">None</button>
                                </div>
                              </div>
                              {meta.fields.map((f: string) => (
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
                                  {meta.portals.map((p: string) => (
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

content = content.replace(old_expand_block, new_expand_block)


# 2. Add `newRelToKey` state for the manual relationship form
state_find = '''  const [newRelTo, setNewRelTo] = useState('')
  const [newRelKey, setNewRelKey] = useState('')'''

state_replace = '''  const [newRelTo, setNewRelTo] = useState('')
  const [newRelKey, setNewRelKey] = useState('')
  const [newRelToKey, setNewRelToKey] = useState('')'''

content = content.replace(state_find, state_replace)

# 3. Update the manual relation form to have TWO dropdowns for the join keys
old_form = '''                      <div className="space-y-1">
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
                      </div>'''

new_form = '''                      <div className="flex items-center gap-2">
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-white/50">From Field</p>
                           <select 
                             value={newRelKey} 
                             onChange={e => setNewRelKey(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                             disabled={!newRelFrom || !result?.layoutMeta[newRelFrom]}
                           >
                             <option value="">Select Field...</option>
                             {newRelFrom && result?.layoutMeta[newRelFrom]?.fields?.map((f: string) => <option key={f} value={f}>{f}</option>)}
                           </select>
                         </div>
                         <div className="flex-1 space-y-1">
                           <p className="text-[10px] text-white/50">To Field</p>
                           <select 
                             value={newRelToKey} 
                             onChange={e => setNewRelToKey(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                             disabled={!newRelTo || !result?.layoutMeta[newRelTo]}
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
                      </div>'''

content = content.replace(old_form, new_form)

with open('src/components/connections/schema-browser.tsx', 'w') as f:
    f.write(content)

