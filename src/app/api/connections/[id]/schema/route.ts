import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/connections/[id]/schema - Get schema for a connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const connection = await db.fMConnection.findUnique({ where: { id } })

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Check for cached schema
    const cached = await db.fMSchemaCache.findFirst({
      where: { connectionId: id, databaseName: connection.database },
    })

    if (cached) {
      return NextResponse.json({
        databaseName: connection.database,
        cachedAt: cached.cachedAt,
        layouts: JSON.parse(cached.layouts),
        scripts: JSON.parse(cached.scripts),
        tables: JSON.parse(cached.tables),
        fields: JSON.parse(cached.fields),
        relationships: JSON.parse(cached.relationships),
      })
    }

    // Generate mock schema if no cache exists
    // In production, this would fetch from the FileMaker Data API
    const schema = generateMockSchema(connection.database)

    // Cache the schema
    await db.fMSchemaCache.create({
      data: {
        connectionId: id,
        databaseName: connection.database,
        layouts: JSON.stringify(schema.layouts),
        scripts: JSON.stringify(schema.scripts),
        tables: JSON.stringify(schema.tables),
        fields: JSON.stringify(schema.fields),
        relationships: JSON.stringify(schema.relationships),
      },
    })

    return NextResponse.json({
      databaseName: connection.database,
      cachedAt: new Date(),
      ...schema,
    })
  } catch (error) {
    console.error('Error fetching schema:', error)
    return NextResponse.json({ error: 'Failed to fetch schema' }, { status: 500 })
  }
}

function generateMockSchema(databaseName: string) {
  const layouts = [
    { name: 'Contacts', recordCount: 1250, fields: 18, modifiable: true },
    { name: 'Invoices', recordCount: 3420, fields: 24, modifiable: true },
    { name: 'Products', recordCount: 580, fields: 15, modifiable: true },
    { name: 'Orders', recordCount: 2100, fields: 22, modifiable: true },
    { name: 'Companies', recordCount: 890, fields: 12, modifiable: true },
    { name: 'Inventory', recordCount: 1560, fields: 20, modifiable: false },
    { name: 'Reports', recordCount: 0, fields: 8, modifiable: false },
  ]

  const scripts = [
    { name: 'Generate Invoice', type: 'standard', description: 'Creates a new invoice from order data' },
    { name: 'Send Email Notification', type: 'standard', description: 'Sends email alerts to users' },
    { name: 'Calculate Totals', type: 'standard', description: 'Recalculates order totals' },
    { name: 'Import Data', type: 'standard', description: 'Bulk imports records from CSV' },
    { name: 'Export Records', type: 'standard', description: 'Exports found set to file' },
    { name: 'Sync Inventory', type: 'standard', description: 'Syncs inventory with external system' },
    { name: 'Validate Fields', type: 'standard', description: 'Validates required field entries' },
    { name: 'Archive Records', type: 'standard', description: 'Moves old records to archive' },
  ]

  const tables = [
    { name: 'Contacts', fieldCount: 18, primaryKey: 'ContactID' },
    { name: 'Invoices', fieldCount: 24, primaryKey: 'InvoiceID' },
    { name: 'Products', fieldCount: 15, primaryKey: 'ProductID' },
    { name: 'Orders', fieldCount: 22, primaryKey: 'OrderID' },
    { name: 'Companies', fieldCount: 12, primaryKey: 'CompanyID' },
    { name: 'Inventory', fieldCount: 20, primaryKey: 'InventoryID' },
    { name: 'LineItems', fieldCount: 10, primaryKey: 'LineItemID' },
    { name: 'Payments', fieldCount: 8, primaryKey: 'PaymentID' },
  ]

  const fields = [
    { name: 'ContactID', table: 'Contacts', type: 'number', global: false, autoEnter: true },
    { name: 'FirstName', table: 'Contacts', type: 'text', global: false, autoEnter: false },
    { name: 'LastName', table: 'Contacts', type: 'text', global: false, autoEnter: false },
    { name: 'Email', table: 'Contacts', type: 'text', global: false, autoEnter: false },
    { name: 'Phone', table: 'Contacts', type: 'text', global: false, autoEnter: false },
    { name: 'CompanyID', table: 'Contacts', type: 'number', global: false, autoEnter: false },
    { name: 'CreatedAt', table: 'Contacts', type: 'timestamp', global: false, autoEnter: true },
    { name: 'InvoiceID', table: 'Invoices', type: 'number', global: false, autoEnter: true },
    { name: 'InvoiceNumber', table: 'Invoices', type: 'text', global: false, autoEnter: true },
    { name: 'TotalAmount', table: 'Invoices', type: 'number', global: false, autoEnter: false },
    { name: 'Status', table: 'Invoices', type: 'text', global: false, autoEnter: false },
    { name: 'DueDate', table: 'Invoices', type: 'date', global: false, autoEnter: false },
    { name: 'ProductID', table: 'Products', type: 'number', global: false, autoEnter: true },
    { name: 'ProductName', table: 'Products', type: 'text', global: false, autoEnter: false },
    { name: 'Price', table: 'Products', type: 'number', global: false, autoEnter: false },
    { name: 'StockQty', table: 'Products', type: 'number', global: false, autoEnter: false },
    { name: 'OrderID', table: 'Orders', type: 'number', global: false, autoEnter: true },
    { name: 'OrderNumber', table: 'Orders', type: 'text', global: false, autoEnter: true },
    { name: 'OrderStatus', table: 'Orders', type: 'text', global: false, autoEnter: false },
  ]

  const relationships = [
    { name: 'Contacts_Invoices', table: 'Contacts', relatedTable: 'Invoices', type: 'one-to-many', keyMatch: 'ContactID = ContactID_fk' },
    { name: 'Contacts_Companies', table: 'Contacts', relatedTable: 'Companies', type: 'many-to-one', keyMatch: 'CompanyID = CompanyID' },
    { name: 'Invoices_LineItems', table: 'Invoices', relatedTable: 'LineItems', type: 'one-to-many', keyMatch: 'InvoiceID = InvoiceID_fk' },
    { name: 'Orders_Invoices', table: 'Orders', relatedTable: 'Invoices', type: 'one-to-one', keyMatch: 'OrderID = OrderID_fk' },
    { name: 'Products_Inventory', table: 'Products', relatedTable: 'Inventory', type: 'one-to-one', keyMatch: 'ProductID = ProductID_fk' },
    { name: 'Products_LineItems', table: 'Products', relatedTable: 'LineItems', type: 'one-to-many', keyMatch: 'ProductID = ProductID_fk' },
  ]

  return { layouts, scripts, tables, fields, relationships }
}
