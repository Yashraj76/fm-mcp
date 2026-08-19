import { BlockList, isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

/**
 * SSRF guard for user-supplied outbound hosts (FileMaker servers, AI base URLs).
 *
 * Blocks loopback, link-local (incl. cloud metadata 169.254.169.254), RFC-1918
 * private ranges, CGNAT, IPv6 ULA/link-local, and multicast/reserved space —
 * both as literals and after DNS resolution, so a public-looking hostname
 * can't point at an internal address.
 *
 * Self-hosted deployments that legitimately reach FileMaker servers on a
 * private LAN (or a local Ollama) can opt out of the private-range checks
 * with SSRF_ALLOW_PRIVATE_HOSTS=true. Scheme validation still applies.
 */

export class SsrfBlockedError extends Error {
  readonly code = 'SSRF_BLOCKED'
  constructor(message: string) {
    super(message)
    this.name = 'SsrfBlockedError'
  }
}

const BLOCKED_IPV4_SUBNETS: Array<[string, number]> = [
  ['0.0.0.0', 8],      // "this network" / unspecified
  ['10.0.0.0', 8],     // RFC 1918 private
  ['100.64.0.0', 10],  // CGNAT (includes Alibaba metadata 100.100.100.200)
  ['127.0.0.0', 8],    // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata 169.254.169.254)
  ['172.16.0.0', 12],  // RFC 1918 private
  ['192.0.0.0', 24],   // IETF protocol assignments
  ['192.168.0.0', 16], // RFC 1918 private
  ['198.18.0.0', 15],  // benchmarking
  ['224.0.0.0', 3],    // multicast, class E, broadcast (224.0.0.0–255.255.255.255)
]

const blockList = new BlockList()
for (const [base, prefix] of BLOCKED_IPV4_SUBNETS) {
  blockList.addSubnet(base, prefix, 'ipv4')
  // Same ranges in IPv4-mapped IPv6 form (::ffff:a.b.c.d) so a mapped literal
  // can't sidestep the IPv4 checks.
  blockList.addSubnet(`::ffff:${base}`, 96 + prefix, 'ipv6')
}
blockList.addAddress('::', 'ipv6')           // unspecified
blockList.addAddress('::1', 'ipv6')          // loopback
blockList.addSubnet('64:ff9b::', 96, 'ipv6') // NAT64 well-known prefix
blockList.addSubnet('fc00::', 7, 'ipv6')     // unique-local (ULA)
blockList.addSubnet('fe80::', 10, 'ipv6')    // link-local
blockList.addSubnet('ff00::', 8, 'ipv6')     // multicast

/** Opt-out for self-hosted deployments whose FileMaker servers live on a private LAN. */
export function allowPrivateHosts(): boolean {
  return process.env.SSRF_ALLOW_PRIVATE_HOSTS === 'true'
}

/**
 * True when the IPv4/IPv6 literal falls in a blocked range.
 * Input that is not a valid IP returns true (fail closed — callers only pass
 * strings they expect to be addresses).
 */
export function isBlockedIp(ip: string): boolean {
  let addr = ip.trim().toLowerCase()
  const zoneIdx = addr.indexOf('%') // strip zone id: fe80::1%en0
  if (zoneIdx !== -1) addr = addr.slice(0, zoneIdx)
  const family = isIP(addr)
  if (family === 0) return true
  return blockList.check(addr, family === 6 ? 'ipv6' : 'ipv4')
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata.goog'])

/** Blocks well-known internal hostnames without needing DNS. */
export function isBlockedHostname(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.$/, '')
  return BLOCKED_HOSTNAMES.has(name) || name.endsWith('.localhost') || name.endsWith('.internal')
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i

/**
 * Parses "host", "host:port", or a full http(s) URL into a URL object.
 * A bare host defaults to https — plain http is only reachable when the user
 * explicitly typed "http://" (that is the http opt-in). Any other scheme is
 * rejected. WHATWG URL parsing also normalizes obfuscated IPv4 literals
 * (decimal/octal/hex, e.g. "2130706433" → "127.0.0.1") before the checks run.
 */
export function parseHostUrl(raw: string): URL {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) throw new SsrfBlockedError('Host is required.')
  const hasScheme = SCHEME_RE.test(trimmed)
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    throw new SsrfBlockedError('Only http and https URLs are allowed.')
  }
  let url: URL
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    throw new SsrfBlockedError('Host is not a valid hostname or URL.')
  }
  if (!url.hostname) throw new SsrfBlockedError('Host is not a valid hostname or URL.')
  return url
}

export type ResolveFn = (hostname: string) => Promise<Array<{ address: string }>>

const defaultResolve: ResolveFn = (hostname) => lookup(hostname, { all: true })

/**
 * Validates a user-supplied host or URL for outbound requests. Returns the
 * parsed URL on success, throws SsrfBlockedError otherwise.
 *
 * IP literals are checked directly; hostnames are checked against the
 * internal-name blocklist and then resolved, with EVERY returned address
 * checked (a hostname is only as safe as the worst address it resolves to).
 * This validates at check time — it does not pin the IP for the eventual
 * connection, so call it as close to the request as practical.
 */
export async function assertPublicHost(
  rawHost: string,
  opts: { resolve?: ResolveFn } = {}
): Promise<URL> {
  const url = parseHostUrl(rawHost)
  if (allowPrivateHosts()) return url

  const hostname = url.hostname.replace(/^\[|\]$/g, '') // URL keeps brackets on IPv6 literals

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new SsrfBlockedError(
        'Host is a loopback, private, link-local, or otherwise internal address and is not allowed.'
      )
    }
    return url
  }

  if (isBlockedHostname(hostname)) {
    throw new SsrfBlockedError(`Host "${hostname}" is not allowed.`)
  }

  const resolve = opts.resolve ?? defaultResolve
  let addresses: Array<{ address: string }>
  try {
    addresses = await resolve(hostname)
  } catch {
    throw new SsrfBlockedError(`Hostname "${hostname}" could not be resolved. Check the address.`)
  }
  if (addresses.length === 0) {
    throw new SsrfBlockedError(`Hostname "${hostname}" could not be resolved. Check the address.`)
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new SsrfBlockedError(
        `Host "${hostname}" resolves to a private or internal address and is not allowed.`
      )
    }
  }
  return url
}

/** Hostnames of AI providers the app supports out of the box. */
export const KNOWN_AI_HOSTS: ReadonlySet<string> = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'openrouter.ai',
  'api.groq.com',
  'api.mistral.ai',
  'api.deepseek.com',
  'api.together.xyz',
  'api.x.ai',
  'api.cohere.com',
  'api.fireworks.ai',
  'api.cerebras.ai',
  'api.perplexity.ai',
  'ai-gateway.vercel.sh',
])

/**
 * Validates a client-supplied AI base URL: must be https and on the
 * known-provider allow-list (extendable via the comma-separated
 * AI_BASE_URL_ALLOWED_HOSTS env var). With SSRF_ALLOW_PRIVATE_HOSTS=true
 * (self-hosted), any http(s) URL is accepted so local runtimes like Ollama
 * keep working.
 */
export function assertAllowedAiBaseUrl(raw: string): URL {
  const url = parseHostUrl(raw)
  if (allowPrivateHosts()) return url

  if (url.protocol !== 'https:') {
    throw new SsrfBlockedError('AI base URL must use https.')
  }
  const hostname = url.hostname.toLowerCase()
  const extra = (process.env.AI_BASE_URL_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
  if (!KNOWN_AI_HOSTS.has(hostname) && !extra.includes(hostname)) {
    throw new SsrfBlockedError(
      `"${hostname}" is not a recognized AI provider host. Set AI_BASE_URL_ALLOWED_HOSTS to allow additional hosts.`
    )
  }
  return url
}
