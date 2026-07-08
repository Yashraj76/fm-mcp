import { apiSuccess, apiNotFound, apiError, apiServerError } from '@/lib/utils/api-response'
import { withAuth } from "@/lib/auth/api-guard"
import { getMcpServer } from '@/lib/db/user-scoped'
import { logger } from '@/lib/logger'

export const POST = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const server = await getMcpServer(id, userId)

    if (!server) {
      return apiNotFound('Server not found')
    }

    // Self-test uses INTERNAL_TEST_SECRET to call the MCP endpoint without an
    // API key. This bypass is only available in non-production environments.
    // In production the bypass path in the MCP endpoint is unconditionally
    // disabled, so this route returns 503 rather than silently calling an
    // endpoint that would reject it with 401.
    if (process.env.NODE_ENV === 'production') {
      return apiError(
        'MCP self-test is not available in production. Use a provisioned API key instead.',
        'NOT_AVAILABLE_IN_PRODUCTION',
        503,
      )
    }

    const internalTestSecret = process.env.INTERNAL_TEST_SECRET
    if (!internalTestSecret) {
      return apiError(
        'INTERNAL_TEST_SECRET is not configured. Set this env var to enable the MCP self-test.',
        'INTERNAL_SECRET_NOT_CONFIGURED',
        503,
      )
    }

    // Determine the base url to call the local endpoint
    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`

    const testUrl = `${baseUrl}/api/mcp/${id}/mcp`
    const testStartTime = Date.now()

    // Call the endpoint using standard fetch
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-test-secret': internalTestSecret,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 1
      })
    })

    const duration = Date.now() - testStartTime
    const status = response.status

    if (!response.ok) {
      const errorText = await response.text()
      return apiError(`MCP endpoint returned status ${status}: ${errorText}`, 'MCP_TEST_FAILED', 400, { status, duration })
    }

    const responseBody = await response.json()
    
    // Verify it is a valid JSON-RPC response
    if (responseBody?.jsonrpc !== '2.0' || (!responseBody.result && !responseBody.error)) {
      return apiError('Invalid JSON-RPC response from MCP endpoint', 'INVALID_JSON_RPC', 400, { status, duration, responseBody })
    }

    return apiSuccess({
      status,
      duration,
      toolsCount: responseBody.result?.tools?.length || 0,
      response: responseBody
    })
  } catch (error: any) {
    logger.error({ err: error }, '[MCP Self-Test API Error]')
    return apiServerError('Internal server error')
  }
})
