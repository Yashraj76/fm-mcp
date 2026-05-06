import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/connections/[id] - Get a single connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const connection = await db.fMConnection.findUnique({
      where: { id },
    })

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    return NextResponse.json(connection)
  } catch (error) {
    console.error('Error fetching connection:', error)
    return NextResponse.json({ error: 'Failed to fetch connection' }, { status: 500 })
  }
}

// PUT /api/connections/[id] - Update a connection
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, host, port, database, username, password, authType, clientId, clientSecret, sslVerify } = body

    const connection = await db.fMConnection.findUnique({ where: { id } })
    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const updated = await db.fMConnection.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(host !== undefined && { host }),
        ...(port !== undefined && { port }),
        ...(database !== undefined && { database }),
        ...(username !== undefined && { username }),
        ...(password !== undefined && { password }),
        ...(authType !== undefined && { authType }),
        ...(clientId !== undefined && { clientId }),
        ...(clientSecret !== undefined && { clientSecret }),
        ...(sslVerify !== undefined && { sslVerify }),
        status: 'disconnected',
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating connection:', error)
    return NextResponse.json({ error: 'Failed to update connection' }, { status: 500 })
  }
}

// DELETE /api/connections/[id] - Delete a connection
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const connection = await db.fMConnection.findUnique({ where: { id } })
    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    await db.fMConnection.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting connection:', error)
    return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 })
  }
}
