import re

with open('src/app/api/connections/[id]/schema/ai-relationships/route.ts', 'r') as f:
    content = f.read()

replacement = '''
    let layoutMeta: Record<string, { fields: string[]; portals: string[] }> = JSON.parse(browsedSchema.rawLayoutMeta || '{}')

    // Use selectedLayouts from request body, or from saved selection, or all layouts
    const savedSelected: string[] = body.selectedLayouts
      || (browsedSchema.selectedLayouts ? JSON.parse(browsedSchema.selectedLayouts) : null)
      || Object.keys(layoutMeta)

    // Ensure we have metadata for selected layouts (fetch if missing)
    const missingLayouts = savedSelected.filter(l => !layoutMeta[l] || !layoutMeta[l].fields)
    
    if (missingLayouts.length > 0) {
      const connection = await db.fMConnection.findUnique({ where: { id } })
      if (connection) {
        const { withFMSession } = await import('@/lib/filemaker/session')
        await withFMSession(connection, async (client) => {
          // Batch fetch up to 20 to avoid extreme slowdowns if they select hundreds
          for (const layoutName of missingLayouts.slice(0, 20)) {
            try {
              const meta = await client.getLayoutMetadata(layoutName)
              const fieldMetaArr = meta?.response?.fieldMetaData || []
              const portalMeta = meta?.response?.portalMetaData || {}
              layoutMeta[layoutName] = {
                fields: fieldMetaArr.map((f: any) => f.name),
                portals: Object.keys(portalMeta),
              }
            } catch (e: any) {
              console.warn(`[ai-relationships] Metadata fetch failed for ${layoutName}:`, e.message)
            }
          }
        })
        
        // Update the cached layoutMeta so we don't fetch again
        await db.browsedSchema.update({
          where: { connectionId: id },
          data: { rawLayoutMeta: JSON.stringify(layoutMeta) }
        })
      }
    }

    const suggestions = detectRelationships(savedSelected, layoutMeta)'''

content = re.sub(r'''\s*const layoutMeta: Record<string, \{ fields: string\[\]; portals: string\[\] \}> = JSON\.parse\(browsedSchema\.rawLayoutMeta \|\| '\{\}'\)\s*const savedSelected: string\[\] = body\.selectedLayouts\s*\|\| \(browsedSchema\.selectedLayouts \? JSON\.parse\(browsedSchema\.selectedLayouts\) : null\)\s*\|\| Object\.keys\(layoutMeta\)\s*const suggestions = detectRelationships\(savedSelected, layoutMeta\)''', replacement, content, flags=re.DOTALL)

with open('src/app/api/connections/[id]/schema/ai-relationships/route.ts', 'w') as f:
    f.write(content)

