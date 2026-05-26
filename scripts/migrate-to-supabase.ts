/**
 * Data migration: Turso → Supabase
 * Uses Turso HTTP API directly (no running dev server needed)
 * Run: npx tsx scripts/migrate-to-supabase.ts
 */

import * as fs from 'fs'

const TURSO_URL = process.env.TURSO_DATABASE_URL?.replace('libsql://', 'https://').replace('https://', 'https://') || ''
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || ''

async function tursoQuery(sql: string, args: any[] = []) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TURSO_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        { type: 'execute', stmt: { sql, args } },
        { type: 'close' }
      ]
    })
  })
  const data = await res.json() as any
  if (data.results?.[0]?.type === 'error') {
    throw new Error(`Turso error: ${JSON.stringify(data.results[0])}`)
  }
  const result = data.results?.[0]?.response?.result
  if (!result) return []
  
  const cols = result.cols.map((c: any) => c.name)
  return result.rows.map((row: any) => {
    const obj: any = {}
    cols.forEach((col: string, i: number) => {
      const cell = row[i]
      obj[col] = cell?.type === 'null' ? null : cell?.value
    })
    return obj
  })
}

function escStr(v: any): string {
  if (v === null || v === undefined) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}
function escBool(v: any): string {
  if (v === null || v === undefined) return 'NULL'
  return (v === true || v === '1' || v === 1) ? 'true' : 'false'
}
function escInt(v: any): string {
  if (v === null || v === undefined) return 'NULL'
  return String(Number(v))
}
function escFloat(v: any): string {
  if (v === null || v === undefined) return 'NULL'
  return String(parseFloat(v))
}
function escDate(v: any): string {
  if (!v) return 'NULL'
  try { return `'${new Date(v).toISOString()}'` } catch { return 'NULL' }
}

async function main() {
  console.log('=== Turso → Supabase Data Migration ===')
  console.log(`Turso URL: ${TURSO_URL}\n`)

  const statements: string[] = []

  // Helper to dump a table
  async function dump(table: string, insertFn: (rows: any[]) => string[]) {
    const rows = await tursoQuery(`SELECT * FROM "${table}"`)
    console.log(`${table}: ${rows.length} rows`)
    statements.push(...insertFn(rows))
  }

  await dump('FMServerConnection', rows => rows.map(r => 
    `INSERT INTO "FMServerConnection" ("id","name","host","port","adminUsername","adminPasswordEncrypted","sslVerify","status","lastTested","lastError","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.name)},${escStr(r.host)},${escInt(r.port)},${escStr(r.adminUsername)},${escStr(r.adminPasswordEncrypted)},${escBool(r.sslVerify)},${escStr(r.status)},${escDate(r.lastTested)},${escStr(r.lastError)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('FMConnection', rows => rows.map(r =>
    `INSERT INTO "FMConnection" ("id","serverConnectionId","name","host","port","database","username","passwordEncrypted","authType","sslVerify","status","schemaCache","lastTested","lastError","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.serverConnectionId)},${escStr(r.name)},${escStr(r.host)},${escInt(r.port)},${escStr(r.database)},${escStr(r.username)},${escStr(r.passwordEncrypted)},${escStr(r.authType)},${escBool(r.sslVerify)},${escStr(r.status)},${escStr(r.schemaCache)},${escDate(r.lastTested)},${escStr(r.lastError)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('BrowsedSchema', rows => rows.map(r =>
    `INSERT INTO "BrowsedSchema" ("id","connectionId","rawLayouts","selectedLayouts","selectedScripts","compiledSchema","lastBrowsedAt","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.connectionId)},${escStr(r.rawLayouts)},${escStr(r.selectedLayouts)},${escStr(r.selectedScripts)},${escStr(r.compiledSchema)},${escDate(r.lastBrowsedAt)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('McpServer', rows => rows.map(r =>
    `INSERT INTO "McpServer" ("id","name","description","version","status","serverUrl","sseToken","proxyUrl","config","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.name)},${escStr(r.description)},${escStr(r.version)},${escStr(r.status)},${escStr(r.serverUrl)},${escStr(r.sseToken)},${escStr(r.proxyUrl)},${escStr(r.config)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('McpApiKey', rows => rows.map(r =>
    `INSERT INTO "McpApiKey" ("id","serverId","keyHash","keyPrefix","createdAt","lastUsedAt") VALUES (${escStr(r.id)},${escStr(r.serverId)},${escStr(r.keyHash)},${escStr(r.keyPrefix)},${escDate(r.createdAt)},${escDate(r.lastUsedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('FMConnectionServer', rows => rows.map(r =>
    `INSERT INTO "FMConnectionServer" ("id","connectionId","serverId","fileNames","isActive","createdAt") VALUES (${escStr(r.id)},${escStr(r.connectionId)},${escStr(r.serverId)},${escStr(r.fileNames)},${escBool(r.isActive)},${escDate(r.createdAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('Branch', rows => rows.map(r =>
    `INSERT INTO "Branch" ("id","name","serverId","isDefault","isProtected","description","status","mergedIntoId","mergedAt","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.name)},${escStr(r.serverId)},${escBool(r.isDefault)},${escBool(r.isProtected)},${escStr(r.description)},${escStr(r.status)},${escStr(r.mergedIntoId)},${escDate(r.mergedAt)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('Tool', rows => rows.map(r =>
    `INSERT INTO "Tool" ("id","serverId","name","description","category","inputSchema","outputSchema","handlerConfig","fmLayout","fmScript","fmMethod","isEnabled","version","isAiGenerated","testConfig","sortOrder","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.serverId)},${escStr(r.name)},${escStr(r.description)},${escStr(r.category)},${escStr(r.inputSchema)},${escStr(r.outputSchema)},${escStr(r.handlerConfig)},${escStr(r.fmLayout)},${escStr(r.fmScript)},${escStr(r.fmMethod)},${escBool(r.isEnabled)},${escInt(r.version)},${escBool(r.isAiGenerated)},${escStr(r.testConfig)},${escInt(r.sortOrder)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('BranchTool', rows => rows.map(r =>
    `INSERT INTO "BranchTool" ("id","branchId","toolId","action","overrideData","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.branchId)},${escStr(r.toolId)},${escStr(r.action)},${escStr(r.overrideData)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('AppSettings', rows => rows.map(r =>
    `INSERT INTO "AppSettings" ("id","aiProvider","aiModel","aiApiKeyEncrypted","aiBaseUrl","aiMaxTokens","aiTemperature","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.aiProvider)},${escStr(r.aiModel)},${escStr(r.aiApiKeyEncrypted)},${escStr(r.aiBaseUrl)},${escInt(r.aiMaxTokens)},${escFloat(r.aiTemperature)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('RelationshipGraph', rows => rows.map(r =>
    `INSERT INTO "RelationshipGraph" ("id","connectionId","relationships","generatedBy","generatedAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.connectionId)},${escStr(r.relationships)},${escStr(r.generatedBy)},${escDate(r.generatedAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  await dump('PlaygroundSession', rows => rows.map(r =>
    `INSERT INTO "PlaygroundSession" ("id","serverId","userMessage","agentPlan","stepLog","finalResult","status","createdAt","updatedAt") VALUES (${escStr(r.id)},${escStr(r.serverId)},${escStr(r.userMessage)},${escStr(r.agentPlan)},${escStr(r.stepLog)},${escStr(r.finalResult)},${escStr(r.status)},${escDate(r.createdAt)},${escDate(r.updatedAt)}) ON CONFLICT ("id") DO NOTHING;`
  ))

  const sql = statements.join('\n')
  fs.writeFileSync('scripts/supabase-data.sql', sql, 'utf8')
  console.log(`\nWrote ${statements.length} INSERT statements to scripts/supabase-data.sql`)
}

main().catch(e => { console.error('Migration failed:', e); process.exit(1) })
