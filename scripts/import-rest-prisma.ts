import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  const outDir = path.join(process.cwd(), 'scripts/supabase-import')
  
  const files = [
    'BrowsedSchema.sql', 'FMSchemaCache.sql',
    'Tool_Clean_Final.sql', 'BranchTool_Clean_Final.sql',
    'AppSettings.sql', 'RelationshipGraph.sql', 'PlaygroundSession.sql'
  ]

  console.log('Importing remaining tables via Prisma...')
  for (const f of files) {
    if (!fs.existsSync(path.join(outDir, f))) {
      console.log(`Skipping ${f} (not found)`)
      continue
    }
    const sql = fs.readFileSync(path.join(outDir, f), 'utf8')
    if (!sql.trim()) continue
    
    console.log(`Executing ${f} (${sql.length} chars)...`)
    
    // Split by statement to avoid giant string issues
    const stmts = sql.split('ON CONFLICT ("id") DO NOTHING;')
    let count = 0
    for (let stmt of stmts) {
      stmt = stmt.trim()
      if (!stmt) continue
      // Re-add the ending
      stmt += ' ON CONFLICT ("id") DO NOTHING;'
      try {
        await prisma.$executeRawUnsafe(stmt)
        count++
      } catch (err: any) {
        console.error(`Error in ${f} statement:`, err.message)
      }
    }
    console.log(`  -> Inserted ${count} rows`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
