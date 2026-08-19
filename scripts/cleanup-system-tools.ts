/**
 * One-off migration: soft-delete the default math tools (`add_numbers`,
 * `subtract_numbers`, `calculate_average`, `calculate_percentage`) that
 * `seedDefaultTools()` auto-registered on every server before that call was
 * removed from `src/lib/tools/job-runner.ts`. Removing the seed call only
 * stops *new* servers from getting them — this cleans up ones already live.
 *
 *   npx tsx scripts/cleanup-system-tools.ts          # dry-run (reports counts)
 *   npx tsx scripts/cleanup-system-tools.ts --apply  # soft-delete them
 *
 * Soft-delete (sets `deletedAt`) rather than hard-delete so ToolExecution
 * history is preserved and MCP clients that already saw these tools get a
 * clean 404 instead of a dangling reference.
 */
import { prisma } from '../src/lib/prisma'

const APPLY = process.argv.includes('--apply')

const SYSTEM_TOOL_NAMES = ['add_numbers', 'subtract_numbers', 'calculate_average', 'calculate_percentage']

async function main() {
  const tools = await prisma.tool.findMany({
    where: { category: 'system', name: { in: SYSTEM_TOOL_NAMES }, deletedAt: null },
    select: { id: true, name: true, serverId: true },
  })

  if (tools.length === 0) {
    console.log('No seeded system tools found — nothing to do.')
    return
  }

  for (const tool of tools) {
    if (APPLY) {
      await prisma.tool.update({ where: { id: tool.id }, data: { deletedAt: new Date() } })
      console.log(`  ✓ soft-deleted ${tool.name} (server ${tool.serverId})`)
    } else {
      console.log(`  • would soft-delete ${tool.name} (server ${tool.serverId})`)
    }
  }

  console.log(
    `\n${APPLY ? 'Soft-deleted' : 'Found'} ${tools.length} seeded system tool(s).` +
    (APPLY ? '' : '\nRe-run with --apply to remove them.')
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
