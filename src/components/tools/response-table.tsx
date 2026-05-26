import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

export function ResponseTable({ data, tableConfig }: { data: any, tableConfig?: any }) {
  if (!data) return <div className="p-4 text-xs text-muted-foreground text-center">No data available</div>

  let records: any[] = []
  let allSteps: any[] = []
  
  if (data.stepResults && Array.isArray(data.stepResults)) {
    // Multi-step tool result
    allSteps = data.stepResults
    
    // Determine which step's result to use as the primary table
    // If tableConfig.primaryTable is specified, we might want to guess which step it is,
    // but the easiest robust way is just grabbing the last data step that has an array.
    const dataSteps = data.stepResults.filter((s: any) => s?.response?.data && Array.isArray(s.response.data))
    if (dataSteps.length > 0) {
      const lastDataStep = dataSteps[dataSteps.length - 1]
      records = lastDataStep.response.data.map((r: any) => ({
        recordId: r.recordId,
        ...r.fieldData
      }))
    }
  } else if (data.response && Array.isArray(data.response.data)) {
    // Standard FileMaker single-table result
    records = data.response.data.map((r: any) => ({
      recordId: r.recordId,
      ...r.fieldData
    }))
  } else if (Array.isArray(data)) {
    records = data
  } else if (typeof data === 'object') {
    records = [data]
  }

  if (records.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground/70 text-center flex items-center justify-center h-32">No matching records found.</div>
  }

  // Determine keys based on tableConfig or fallback to all unique keys
  let keys = Array.from(new Set(records.flatMap(r => Object.keys(r))))
  if (tableConfig?.columns && Array.isArray(tableConfig.columns)) {
    // Only use configured columns that actually exist in the data (or allow all to avoid hiding data completely if AI hallucinates)
    const configuredCols = tableConfig.columns.filter((c: string) => keys.includes(c))
    if (configuredCols.length > 0) {
      keys = configuredCols
    }
  }

  // Extract Summary Fields
  const summaryFields = tableConfig?.summaryFields || []

  return (
    <div className="flex flex-col h-full bg-background/50">
      <ScrollArea className="w-full flex-1 max-h-[350px] custom-scrollbar">
        <div className="min-w-max">
          <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-muted/80 text-foreground sticky top-0 z-20 backdrop-blur-md shadow-sm border-b border-border/60">
            <tr>
              {keys.map((key) => (
                <th key={key} className="px-4 py-3 font-semibold tracking-wide uppercase text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {records.map((r, i) => (
              <tr key={i} className="hover:bg-muted/40 transition-colors group">
                {keys.map((key) => {
                  let val = r[key]
                  if (typeof val === 'object' && val !== null) {
                    val = JSON.stringify(val)
                  }
                  return (
                    <td key={key} className="px-4 py-2.5 truncate max-w-[250px] text-foreground/80 group-hover:text-foreground transition-colors" title={String(val ?? '')}>
                      {String(val ?? '')}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      
      {/* Summary Metrics */}
      {summaryFields.length > 0 && allSteps.length > 0 && (
        <div className="p-4 border-t border-border/50 bg-muted/20 backdrop-blur-sm relative z-10 flex flex-wrap gap-4">
          {summaryFields.map((metric: any, idx: number) => {
            // metric.fromStep refers to the stepIndex of the tool execution
            // We need to find the step result corresponding to that index
            const stepResult = allSteps.find(s => s.stepIndex === metric.fromStep)
            let val = 'N/A'
            if (stepResult?.result) {
              val = metric.field ? stepResult.result[metric.field] || stepResult.result : stepResult.result
            } else if (stepResult?.response?.scriptResult) {
               val = stepResult.response.scriptResult
            }
            
            // Format number safely
            if (typeof val === 'number') {
              val = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(val)
            } else if (typeof val === 'object') {
              val = JSON.stringify(val)
            }

            return (
              <Card key={idx} className="bg-card/80 border-border/50 shadow-sm min-w-[140px] flex-1 max-w-[200px]">
                <CardContent className="p-3 flex flex-col justify-center">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground truncate mb-1">
                    {metric.label}
                  </span>
                  <span className="text-lg font-semibold text-primary truncate" title={String(val)}>
                    {val}
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
