import re

with open('src/components/connections/schema-browser.tsx', 'r') as f:
    content = f.read()

find = '''<select 
                             value={newRelFrom} 
                             onChange={e => setNewRelFrom(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                           >'''

replace = '''<select 
                             value={newRelFrom} 
                             onChange={e => {
                               const val = e.target.value
                               setNewRelFrom(val)
                               if (val && !result?.layoutMeta[val]) toggleExpandLayout(val)
                             }} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                           >'''

content = content.replace(find, replace)

find2 = '''<select 
                             value={newRelTo} 
                             onChange={e => setNewRelTo(e.target.value)} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                           >'''

replace2 = '''<select 
                             value={newRelTo} 
                             onChange={e => {
                               const val = e.target.value
                               setNewRelTo(val)
                               if (val && !result?.layoutMeta[val]) toggleExpandLayout(val)
                             }} 
                             className="w-full h-6 text-[11px] px-1 bg-black/20 border border-white/10 rounded text-white"
                           >'''

content = content.replace(find2, replace2)

with open('src/components/connections/schema-browser.tsx', 'w') as f:
    f.write(content)

