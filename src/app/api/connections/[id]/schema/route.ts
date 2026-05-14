import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { withFMSession } from '@/lib/filemaker/session'

// GET /api/connections/[id]/schema - Get schema for a connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const connection = await db.fMConnection.findUnique({ where: { id } })

    if (!connection) {
      return NextResponse.json({ success: false, error: 'Connection not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Check for cached schema (< 5 mins old)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const cached = await db.fMSchemaCache.findFirst({
      where: { 
        connectionId: id, 
        databaseName: connection.database,
        cachedAt: { gte: fiveMinutesAgo }
      },
    })

    if (cached) {
      return NextResponse.json({
        success: true,
        data: {
          databaseName: connection.database,
          cachedAt: cached.cachedAt,
          layouts: JSON.parse(cached.layouts),
          scripts: JSON.parse(cached.scripts),
          tables: JSON.parse(cached.tables),
          fields: JSON.parse(cached.fields),
          relationships: JSON.parse(cached.relationships),
        }
      })
    }

    try {
      // Fetch live schema
      const schema = await withFMSession(connection, async (client) => {
        const layoutsRes = await client.getLayouts()
        const scriptsRes = await client.getScripts()
        
        // Extract layout names
        const layouts = layoutsRes.response.layouts || []
        const layoutsList: any[] = []
        
        // Extract flat layout list
        const extractLayouts = (folder: any) => {
          if (folder.folderLayoutNames) {
            folder.folderLayoutNames.forEach((l: any) => extractLayouts(l))
          } else {
            layoutsList.push(folder)
          }
        }
        layouts.forEach((l: any) => extractLayouts(l))
        
        // Fetch fields for each layout (limit to 10 for performance if too many)
        const fields: any[] = []
        for (const layout of layoutsList.slice(0, 50)) {
          try {
            const meta = await client.getLayoutMetadata(layout.name)
            if (meta.response.fieldMetaData) {
              meta.response.fieldMetaData.forEach((f: any) => {
                fields.push({
                  name: f.name,
                  table: layout.name, // using layout name as proxy for table
                  type: f.result || 'text',
                  global: f.global,
                  autoEnter: f.autoEnter
                })
              })
            }
          } catch (e) {
            console.warn(`[Schema] Failed to get metadata for layout ${layout.name}`)
          }
        }

        const scripts = scriptsRes.response.scripts || []

        return {
          layouts: layoutsList,
          scripts,
          tables: layoutsList.map(l => ({ name: l.name, fieldCount: 0, primaryKey: 'id' })), // Proxy tables
          fields,
          relationships: [] // Relationships not directly exposed by Data API
        }
      })

      // Update or Create cache
      const cachedAt = new Date()
      
      const existingCache = await db.fMSchemaCache.findFirst({
        where: { connectionId: id, databaseName: connection.database }
      })
      
      if (existingCache) {
        await db.fMSchemaCache.update({
          where: { id: existingCache.id },
          data: {
            layouts: JSON.stringify(schema.layouts),
            scripts: JSON.stringify(schema.scripts),
            tables: JSON.stringify(schema.tables),
            fields: JSON.stringify(schema.fields),
            relationships: JSON.stringify(schema.relationships),
            cachedAt
          }
        })
      } else {
        await db.fMSchemaCache.create({
          data: {
            connectionId: id,
            databaseName: connection.database,
            layouts: JSON.stringify(schema.layouts),
            scripts: JSON.stringify(schema.scripts),
            tables: JSON.stringify(schema.tables),
            fields: JSON.stringify(schema.fields),
            relationships: JSON.stringify(schema.relationships),
            cachedAt
          },
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          databaseName: connection.database,
          cachedAt,
          ...schema,
        }
      })
    } catch (fmError: any) {
      console.error('[Schema Fetch Error]', fmError)
      return NextResponse.json({ 
        success: false, 
        error: fmError.message || 'Failed to fetch schema from FileMaker', 
        code: 'SCHEMA_FETCH_ERROR' 
      }, { status: 500 })
    }
  } catch (error: any) {
    console.error('[API Error]', error)
    return NextResponse.json({ success: false, error: 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
}
