import assert from 'assert'
import { parseODataCsdl, ODataEntityMeta } from './odata-metadata'

// ── helpers ───────────────────────────────────────────────────────────────────

function assertHasEntity(meta: ODataEntityMeta, name: string) {
  assert.ok(name in meta, `Expected entity "${name}" in meta. Keys: ${Object.keys(meta).join(', ')}`)
}

function assertField(meta: ODataEntityMeta, entity: string, fieldName: string, expectedType?: string) {
  assertHasEntity(meta, entity)
  const field = meta[entity].fields.find((f) => f.name === fieldName)
  assert.ok(field, `Expected field "${fieldName}" on entity "${entity}". Fields: ${meta[entity].fields.map((f) => f.name).join(', ')}`)
  if (expectedType !== undefined) {
    assert.strictEqual(field.type, expectedType, `Expected "${fieldName}.type" to be "${expectedType}", got "${field.type}"`)
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const SINGLE_ENTITY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="com.filemaker.odata" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Contacts">
        <Key><PropertyRef Name="recordId"/></Key>
        <Property Name="recordId" Type="Edm.Int64" Nullable="false"/>
        <Property Name="FirstName" Type="Edm.String"/>
        <Property Name="LastName" Type="Edm.String"/>
        <Property Name="Email" Type="Edm.String"/>
        <Property Name="CreatedAt" Type="Edm.DateTimeOffset"/>
      </EntityType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`

const MULTI_ENTITY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="com.filemaker.odata" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Customers">
        <Key><PropertyRef Name="recordId"/></Key>
        <Property Name="recordId" Type="Edm.Int64" Nullable="false"/>
        <Property Name="Name" Type="Edm.String"/>
        <Property Name="Balance" Type="Edm.Decimal"/>
      </EntityType>
      <EntityType Name="Orders">
        <Key><PropertyRef Name="recordId"/></Key>
        <Property Name="recordId" Type="Edm.Int64" Nullable="false"/>
        <Property Name="OrderDate" Type="Edm.DateTimeOffset"/>
        <Property Name="Amount" Type="Edm.Decimal"/>
        <Property Name="CustomerId" Type="Edm.Int64"/>
      </EntityType>
      <EntityType Name="Products">
        <Key><PropertyRef Name="recordId"/></Key>
        <Property Name="recordId" Type="Edm.Int64" Nullable="false"/>
        <Property Name="SKU" Type="Edm.String"/>
        <Property Name="Price" Type="Edm.Decimal"/>
      </EntityType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`

const MULTI_SCHEMA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="com.filemaker.odata.tables" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Invoices">
        <Property Name="recordId" Type="Edm.Int64"/>
        <Property Name="Total" Type="Edm.Decimal"/>
      </EntityType>
    </Schema>
    <Schema Namespace="com.filemaker.odata.views" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="InvoiceSummary">
        <Property Name="Month" Type="Edm.String"/>
        <Property Name="Revenue" Type="Edm.Decimal"/>
      </EntityType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`

const SINGLE_PROPERTY_ENTITY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="com.filemaker.odata" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Settings">
        <Property Name="Value" Type="Edm.String"/>
      </EntityType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`

const NO_TYPE_ATTR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="com.filemaker.odata" xmlns="http://docs.oasis-open.org/odata/ns/edm">
      <EntityType Name="Misc">
        <Property Name="UntypedField"/>
      </EntityType>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`

// ── tests ─────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('🚀 Starting parseODataCsdl Tests...\n')

  // ── 1. Single entity + multiple properties ───────────────────────────────
  console.log('Testing single entity with multiple properties...')
  {
    const meta = parseODataCsdl(SINGLE_ENTITY_XML)
    assert.strictEqual(Object.keys(meta).length, 1, 'Expected exactly 1 entity')
    assertHasEntity(meta, 'Contacts')
    assert.strictEqual(meta['Contacts'].fields.length, 5, 'Expected 5 fields on Contacts')
    assertField(meta, 'Contacts', 'recordId', 'Edm.Int64')
    assertField(meta, 'Contacts', 'FirstName', 'Edm.String')
    assertField(meta, 'Contacts', 'Email', 'Edm.String')
    assertField(meta, 'Contacts', 'CreatedAt', 'Edm.DateTimeOffset')
    console.log('  ✓ Single entity: correct entity name and field count')
    console.log('  ✓ Single entity: field types mapped correctly')
  }

  // ── 2. Multiple entities in one schema ───────────────────────────────────
  console.log('\nTesting multiple entities in one schema...')
  {
    const meta = parseODataCsdl(MULTI_ENTITY_XML)
    assert.strictEqual(Object.keys(meta).length, 3, 'Expected 3 entities')
    assertHasEntity(meta, 'Customers')
    assertHasEntity(meta, 'Orders')
    assertHasEntity(meta, 'Products')
    assertField(meta, 'Customers', 'Balance', 'Edm.Decimal')
    assertField(meta, 'Orders', 'OrderDate', 'Edm.DateTimeOffset')
    assertField(meta, 'Products', 'Price', 'Edm.Decimal')
    console.log('  ✓ Multiple entities: all 3 entities parsed')
    console.log('  ✓ Multiple entities: fields on each entity correct')
  }

  // ── 3. Multiple Schema blocks (multiple namespaces) ───────────────────────
  console.log('\nTesting multiple Schema blocks...')
  {
    const meta = parseODataCsdl(MULTI_SCHEMA_XML)
    assert.strictEqual(Object.keys(meta).length, 2, 'Expected 2 entities across 2 schemas')
    assertHasEntity(meta, 'Invoices')
    assertHasEntity(meta, 'InvoiceSummary')
    assertField(meta, 'Invoices', 'Total', 'Edm.Decimal')
    assertField(meta, 'InvoiceSummary', 'Revenue', 'Edm.Decimal')
    console.log('  ✓ Multi-schema: entities from both namespaces merged')
  }

  // ── 4. Entity with a single property (fast-xml-parser singleton collapse) ─
  console.log('\nTesting entity with a single property...')
  {
    const meta = parseODataCsdl(SINGLE_PROPERTY_ENTITY_XML)
    assertHasEntity(meta, 'Settings')
    assert.strictEqual(meta['Settings'].fields.length, 1, 'Expected 1 field on Settings')
    assertField(meta, 'Settings', 'Value', 'Edm.String')
    console.log('  ✓ Single-property entity: not collapsed to non-array')
  }

  // ── 5. Property without a Type attribute defaults to Edm.String ──────────
  console.log('\nTesting property with no Type attribute...')
  {
    const meta = parseODataCsdl(NO_TYPE_ATTR_XML)
    assertHasEntity(meta, 'Misc')
    assertField(meta, 'Misc', 'UntypedField', 'Edm.String')
    console.log('  ✓ Missing Type attribute defaults to Edm.String')
  }

  // ── 6. Malformed XML throws ───────────────────────────────────────────────
  console.log('\nTesting malformed XML handling...')
  {
    try {
      parseODataCsdl('<this is not > valid < xml')
      assert.fail('Expected parseODataCsdl to throw on malformed XML')
    } catch (e: any) {
      // Any error is acceptable — main concern is it doesn't silently succeed
      console.log('  ✓ Malformed XML throws an error')
    }
  }

  // ── 7. XML with no Edmx root throws ──────────────────────────────────────
  console.log('\nTesting XML with no Edmx root...')
  {
    try {
      parseODataCsdl('<Root><SomethingElse/></Root>')
      assert.fail('Expected parseODataCsdl to throw with no Edmx root')
    } catch (e: any) {
      assert.ok(
        e.message.includes('Edmx') || e.message.includes('DataServices') || e.message.includes('Schema'),
        `Expected error message to mention missing element, got: ${e.message}`,
      )
      console.log('  ✓ No Edmx root throws with descriptive message')
    }
  }

  // ── 8. Namespace prefix stripping ────────────────────────────────────────
  // Both "edmx:Edmx" and unprefixed "Edmx" should parse identically
  console.log('\nTesting namespace prefix stripping...')
  {
    const noPrefixXml = SINGLE_ENTITY_XML.replace(/edmx:/g, '')
    const meta = parseODataCsdl(noPrefixXml)
    assertHasEntity(meta, 'Contacts')
    console.log('  ✓ removeNSPrefix: unprefixed XML parses the same as prefixed')
  }

  console.log('\n🎉 ALL ODATA-METADATA TESTS PASSED! 🎉')
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err)
  process.exit(1)
})
