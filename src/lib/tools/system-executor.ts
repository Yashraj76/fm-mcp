export function executeSystemTool(operation: string, params: Record<string, any>): any {
  switch (operation) {
    case 'add': {
      const values = Array.isArray(params.values) ? params.values : [];
      return { result: values.reduce((sum, v) => sum + Number(v || 0), 0), operation: 'add', inputs: values };
    }
    case 'subtract': {
      return { result: Number(params.a || 0) - Number(params.b || 0), operation: 'subtract', a: params.a, b: params.b };
    }
    case 'average': {
      const vals = Array.isArray(params.values) ? params.values.map(Number).filter(v => !isNaN(v)) : [];
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      return { result: Math.round(avg * 100) / 100, operation: 'average', count: vals.length, inputs: vals };
    }
    case 'percentage': {
      const pct = params.total > 0 ? (Number(params.value) / Number(params.total)) * 100 : 0;
      return { result: Math.round(pct * 100) / 100, operation: 'percentage', value: params.value, total: params.total };
    }
    default:
      throw new Error(`Unknown system operation: ${operation}`);
  }
}
