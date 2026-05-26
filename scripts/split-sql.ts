/**
 * Reads supabase-data.sql and imports data to Supabase via MCP execute_sql
 * Split into batches since MCP has a query size limit
 */

import * as fs from 'fs'
import * as path from 'path'

// Read the SQL
const sql = fs.readFileSync(path.join(process.cwd(), 'scripts/supabase-data.sql'), 'utf8')

// Split by newline and group statements per table
const lines = sql.split('\n').filter(l => l.trim().startsWith('INSERT INTO'))

// Group by table name
const groups: Record<string, string[]> = {}
for (const line of lines) {
  const match = line.match(/INSERT INTO "([^"]+)"/)
  if (!match) continue
  const table = match[1]
  if (!groups[table]) groups[table] = []
  groups[table].push(line)
}

// Print summary
for (const [table, stmts] of Object.entries(groups)) {
  console.log(`${table}: ${stmts.length} rows`)
}

// Write per-table SQL files for easy manual import
const outDir = path.join(process.cwd(), 'scripts/supabase-import')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir)

const order = [
  'FMServerConnection', 'FMConnection', 'BrowsedSchema', 'FMSchemaCache',
  'McpServer', 'McpApiKey', 'FMConnectionServer',
  'Branch', 'Tool', 'BranchTool',
  'AppSettings', 'RelationshipGraph', 'PlaygroundSession',
  'ToolGenerationJob', 'Deployment', 'ActivityLog'
]

for (const table of order) {
  const stmts = groups[table]
  if (!stmts || stmts.length === 0) continue
  const content = stmts.join('\n')
  fs.writeFileSync(path.join(outDir, `${table}.sql`), content)
}

console.log(`\nWritten per-table SQL files to scripts/supabase-import/`)
console.log('You can now run each file against your Supabase project.')
