import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from "@/lib/auth/api-guard"
import { getMcpServer } from '@/lib/db/user-scoped'

export const POST = withAuth(async (request, { params, userId }) => {
  try {
    const { id } = await params
    const server = await getMcpServer(id, userId)

    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    // Determine the base url to call the local endpoint
    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'
    const baseUrl = `${protocol}://${host}`

    const testUrl = `${baseUrl}/api/mcp/${id}/mcp`
    const secret = process.env.INTERNAL_TEST_SECRET || 'mcp-self-test-secret'

    const testStartTime = Date.now()

    // Call the endpoint using standard fetch
    const response = await fetch(testUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-test-secret': secret
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
      return NextResponse.json({
        success: false,
        error: `MCP endpoint returned status ${status}: ${errorText}`,
        code: 'MCP_TEST_FAILED',
        data: { status, duration }
      }, { status: 400 })
    }

    const responseBody = await response.json()
    
    // Verify it is a valid JSON-RPC response
    if (responseBody?.jsonrpc !== '2.0' || (!responseBody.result && !responseBody.error)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid JSON-RPC response from MCP endpoint',
        code: 'INVALID_JSON_RPC',
        data: { status, duration, responseBody }
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        status,
        duration,
        toolsCount: responseBody.result?.tools?.length || 0,
        response: responseBody
      }
    })
  } catch (error: any) {
    console.error('[MCP Self-Test API Error]', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal server error', code: 'SERVER_ERROR' }, { status: 500 })
  }
})
