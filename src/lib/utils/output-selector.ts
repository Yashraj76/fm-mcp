/**
 * Projects a value down to the part addressed by a dot-path, e.g.
 * "response.data[0].fieldData.Name". Used to apply a Tool's outputSelector
 * to its raw FM/OData response before returning it to the MCP client.
 */
export function projectByPath(value: unknown, path: string | null | undefined): unknown {
  const trimmed = path?.trim()
  if (!trimmed) return value

  const segments = trimmed.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)

  let current: unknown = value
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (Number.isNaN(index)) return undefined
      current = current[index]
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return current
}
