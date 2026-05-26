import assert from 'assert'
import {
  executeSingleStepTool,
  executeMultiStepTool,
  executeToolWithParams,
} from './executor-service'
import { FileMakerClient } from '../filemaker/client'

// Simple mock wrapper for matching test specs
function createMockFn(impl: (...args: any[]) => any) {
  const fn = (...args: any[]) => {
    fn.mock.calls.push(args)
    return impl(...args)
  }
  fn.mock = { calls: [] as any[][] }
  return fn
}

// Mock FileMakerClient
const mockClient = {
  find: createMockFn(() => Promise.resolve({ response: { data: [] } })),
  listRecords: createMockFn(() => Promise.resolve({ response: { data: [] } })),
  createRecord: createMockFn(() => Promise.resolve({ response: { recordId: '123' } })),
  getRecord: createMockFn(() => Promise.resolve({ response: { data: [] } })),
  updateRecord: createMockFn(() => Promise.resolve({ response: { recordId: '123' } })),
  deleteRecord: createMockFn(() => Promise.resolve({ response: {} })),
  runScript: createMockFn(() => Promise.resolve({ response: { scriptResult: 'ok', scriptError: '0' } })),
} as unknown as FileMakerClient

async function runTests() {
  console.log('🚀 Starting Executor Service Smoke Tests...\n')

  // 1. System Tools
  console.log('Testing System Tools...')
  {
    const tool = {
      category: 'system',
      fmMethod: 'add',
      handlerConfig: { operation: 'add' },
    }
    const result = await executeToolWithParams(tool, { values: [5, 10, 15] }, null)
    assert.strictEqual(result.result, 30, 'System tool "add" failed')
    console.log('  ✓ System Tool: add passed')
  }

  {
    const tool = {
      category: 'system',
      fmMethod: 'subtract',
      handlerConfig: { operation: 'subtract' },
    }
    const result = await executeToolWithParams(tool, { a: 100, b: 35 }, null)
    assert.strictEqual(result.result, 65, 'System tool "subtract" failed')
    console.log('  ✓ System Tool: subtract passed')
  }

  {
    const tool = {
      category: 'system',
      fmMethod: 'average',
      handlerConfig: { operation: 'average' },
    }
    const result = await executeToolWithParams(tool, { values: [10, 20, 30] }, null)
    assert.strictEqual(result.result, 20, 'System tool "average" failed')
    console.log('  ✓ System Tool: average passed')
  }

  {
    const tool = {
      category: 'system',
      fmMethod: 'percentage',
      handlerConfig: { operation: 'percentage' },
    }
    const result = await executeToolWithParams(tool, { value: 75, total: 300 }, null)
    assert.strictEqual(result.result, 25, 'System tool "percentage" failed')
    console.log('  ✓ System Tool: percentage passed')
  }

  // 2. Single Step FileMaker Tools
  console.log('\nTesting Single Step FileMaker Tools...')
  {
    const handlerConfig = {
      layout: 'Contacts',
      fieldMappings: {
        firstName: 'First_Name_FM',
        email: 'Email_FM',
      },
    }
    const params = {
      firstName: 'John',
      email: 'john@example.com',
      limit: 10,
    }

    const mockFind = createMockFn((layout, query, limit) => {
      assert.strictEqual(layout, 'Contacts')
      assert.deepStrictEqual(query[0], {
        First_Name_FM: 'John',
        Email_FM: 'john@example.com',
      })
      assert.strictEqual(limit, 10)
      return Promise.resolve({ response: { data: [{ recordId: '1', fieldData: {} }] } })
    })
    mockClient.find = mockFind as any

    const result = await executeSingleStepTool(mockClient, 'find', handlerConfig, params)
    assert.strictEqual(result.response.data[0].recordId, '1', 'Single-step find failed')
    console.log('  ✓ Single Step: find passed')
  }

  {
    const handlerConfig = {
      layout: 'Contacts',
      fieldMappings: {
        firstName: 'First_Name_FM',
      },
    }
    const params = {}

    const mockListRecords = createMockFn((layout, limit, offset) => {
      assert.strictEqual(layout, 'Contacts')
      assert.strictEqual(limit, 50)
      assert.strictEqual(offset, 1)
      return Promise.resolve({ response: { data: [{ recordId: '99', fieldData: {} }] } })
    })
    mockClient.listRecords = mockListRecords as any

    const result = await executeSingleStepTool(mockClient, 'find', handlerConfig, params)
    assert.strictEqual(result.response.data[0].recordId, '99', 'Single-step empty find listRecords fallback failed')
    console.log('  ✓ Single Step: empty find fallback to listRecords passed')
  }

  {
    const handlerConfig = { layout: 'Contacts' }
    const params = { First_Name: 'Alice', Email: 'alice@example.com' }

    const mockCreate = createMockFn((layout, data) => {
      assert.strictEqual(layout, 'Contacts')
      assert.deepStrictEqual(data, params)
      return Promise.resolve({ response: { recordId: '500' } })
    })
    mockClient.createRecord = mockCreate as any

    const result = await executeSingleStepTool(mockClient, 'create', handlerConfig, params)
    assert.strictEqual(result.response.recordId, '500', 'Single-step create failed')
    console.log('  ✓ Single Step: create passed')
  }

  // 3. Multi Step FileMaker Tools
  console.log('\nTesting Multi Step FileMaker Tools...')
  {
    const steps = [
      {
        stepIndex: 0,
        api: 'data-api',
        layout: 'Customers',
        fieldMappings: { email: 'EmailAddress' },
        extractField: 'CustomerID',
        useExtractedAs: 'extractedCustomerId',
      },
      {
        stepIndex: 1,
        api: 'data-api',
        layout: 'Orders',
        fieldMappings: { extractedCustomerId: 'CustomerID_FK' },
      },
    ]

    const mockFind = createMockFn((layout, query) => {
      if (layout === 'Customers') {
        assert.deepStrictEqual(query[0], { EmailAddress: 'cust@example.com' })
        return Promise.resolve({
          response: {
            data: [{ recordId: '1', fieldData: { CustomerID: 'CUST-888' } }],
          },
        })
      } else if (layout === 'Orders') {
        assert.deepStrictEqual(query[0], { CustomerID_FK: 'CUST-888' })
        return Promise.resolve({
          response: {
            data: [{ recordId: '20', fieldData: { OrderNumber: 'ORD-9999' } }],
          },
        })
      }
      return Promise.reject(new Error('Unknown layout'))
    })
    mockClient.find = mockFind as any

    const result = await executeMultiStepTool(mockClient, steps, { email: 'cust@example.com' })
    assert.strictEqual(result.stepResults.length, 2, 'Multi-step results count failed')
    assert.strictEqual(result.runtimeParams.extractedCustomerId, 'CUST-888', 'Multi-step extraction failed')
    assert.strictEqual(result.stepResults[1].response.data[0].fieldData.OrderNumber, 'ORD-9999', 'Multi-step final result failed')
    console.log('  ✓ Multi Step: sequential find & extraction passed')
  }

  {
    const steps = [
      {
        stepIndex: 0,
        api: 'data-api',
        layout: 'OrderItems',
        fieldMappings: { orderId: 'OrderID' },
        extractField: 'ProductID',
        useExtractedAs: 'productIds',
        extractMode: 'all',
      },
      {
        stepIndex: 1,
        api: 'data-api',
        layout: 'Products',
        joinField: 'ID',
        joinFrom: 'productIds',
        staticFilters: {
          Active: '1',
          ReleaseYear: '{year}',
        },
      },
    ]

    const mockFind = createMockFn((layout, query) => {
      if (layout === 'OrderItems') {
        return Promise.resolve({
          response: {
            data: [
              { recordId: '10', fieldData: { ProductID: 'PROD-A' } },
              { recordId: '11', fieldData: { ProductID: 'PROD-B' } },
            ],
          },
        })
      } else if (layout === 'Products') {
        assert.deepStrictEqual(query, [
          { ID: '=PROD-A' },
          { ID: '=PROD-B' },
        ])
        return Promise.resolve({
          response: {
            data: [
              { recordId: '100', fieldData: { ID: 'PROD-A', Active: '1', ReleaseYear: String(new Date().getFullYear()) } },
              { recordId: '200', fieldData: { ID: 'PROD-B', Active: '0', ReleaseYear: String(new Date().getFullYear()) } },
            ],
            dataInfo: { foundCount: 2 },
          },
        })
      }
      return Promise.reject(new Error('Unknown layout'))
    })
    mockClient.find = mockFind as any

    const result = await executeMultiStepTool(mockClient, steps, { orderId: 'ORD-123' })
    assert.deepStrictEqual(result.runtimeParams.productIds, ['PROD-A', 'PROD-B'], 'Multi-step extractMode all failed')
    
    const step1Response = result.stepResults[1].response
    assert.strictEqual(step1Response.data.length, 1, 'Multi-step static filter count failed')
    assert.strictEqual(step1Response.data[0].fieldData.ID, 'PROD-A', 'Multi-step static filter selection failed')
    console.log('  ✓ Multi Step: join mode, chunking, and client-side filtering passed')
  }

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉')
}

runTests().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err)
  process.exit(1)
})
