import { prisma } from '../prisma';

const SYSTEM_TOOLS = [
  {
    name: 'add_numbers',
    description: 'Add two or more numbers together. Use for summing values from query results.',
    category: 'system', executionStrategy: 'system',
    inputSchema: { type: 'object', properties: { values: { type: 'array', items: { type: 'number' }, description: 'Array of numbers to add' } }, required: ['values'] },
    handlerConfig: { operation: 'add' },
  },
  {
    name: 'subtract_numbers',
    description: 'Subtract one number from another. Use for calculating differences.',
    category: 'system', executionStrategy: 'system',
    inputSchema: { type: 'object', properties: { a: { type: 'number', description: 'Minuend' }, b: { type: 'number', description: 'Subtrahend' } }, required: ['a', 'b'] },
    handlerConfig: { operation: 'subtract' },
  },
  {
    name: 'calculate_average',
    description: 'Calculate the average (mean) of an array of numbers.',
    category: 'system', executionStrategy: 'system',
    inputSchema: { type: 'object', properties: { values: { type: 'array', items: { type: 'number' } } }, required: ['values'] },
    handlerConfig: { operation: 'average' },
  },
  {
    name: 'calculate_percentage',
    description: 'Calculate what percentage a value is of a total. Returns a number 0-100.',
    category: 'system', executionStrategy: 'system',
    inputSchema: { type: 'object', properties: { value: { type: 'number' }, total: { type: 'number' } }, required: ['value', 'total'] },
    handlerConfig: { operation: 'percentage' },
  },
];

export async function seedDefaultTools(serverId: string) {
  const defaultBranch = await prisma.branch.findFirst({
    where: { serverId, isDefault: true }
  });

  if (!defaultBranch) {
    throw new Error('No default branch found for this server');
  }

  for (const tool of SYSTEM_TOOLS) {
    const exists = await prisma.tool.findFirst({ where: { serverId, name: tool.name } });
    if (!exists) {
      await prisma.tool.create({
        data: {
          name: tool.name,
          description: tool.description,
          inputSchema: JSON.stringify(tool.inputSchema),
          handlerConfig: JSON.stringify(tool.handlerConfig),
          isEnabled: true,
          category: 'system',
          serverId,
          branchId: defaultBranch.id,
          isAiGenerated: true
        },
      });
    }
  }
}
