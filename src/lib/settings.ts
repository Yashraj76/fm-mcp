export const defaultSettings = {
  general: { theme: 'dark', autoSave: true, connectionTimeout: 30 },
  filemakerApi: { dataApiVersion: 'v2', maxRecordsPerRequest: 100, portalDepthLimit: 5, defaultLayout: '' },
  ai: {
    provider: 'openai', apiKey: '', model: '', baseUrl: '', maxTokens: 4096, temperature: 0.7,
    maxSuggestions: 10, autoSuggestOnSchemaLoad: true, toolGenerationEnabled: true,
    schemaAnalysisEnabled: true, rateLimitPerMinute: 60, monthlyBudget: null,
    enableToolTesting: true, verboseLogging: false,
  },
  security: { encryptCredentials: true, tokenExpiryMinutes: 15, auditLogging: true, allowedOrigins: [] as string[] },
}

const globalForSettings = globalThis as unknown as {
  settings: typeof defaultSettings | undefined
}

export const getSettings = () => {
  if (!globalForSettings.settings) {
    globalForSettings.settings = { ...defaultSettings }
  }
  return globalForSettings.settings
}

export const updateSettings = (newSettings: any) => {
  if (!globalForSettings.settings) {
    globalForSettings.settings = { ...defaultSettings }
  }
  // Deep merge or simple assignment depending on structure
  globalForSettings.settings = {
    general: { ...globalForSettings.settings.general, ...newSettings.general },
    filemakerApi: { ...globalForSettings.settings.filemakerApi, ...newSettings.filemakerApi },
    ai: { ...globalForSettings.settings.ai, ...newSettings.ai },
    security: { ...globalForSettings.settings.security, ...newSettings.security },
  }
  
  if (newSettings.ai?.apiKey !== undefined && newSettings.ai.apiKey !== '') {
    globalForSettings.settings.ai.apiKey = newSettings.ai.apiKey
  }
  return globalForSettings.settings
}
