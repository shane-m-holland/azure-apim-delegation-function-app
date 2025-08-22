// Jest setup file for Azure Functions testing

// Mock Azure Functions context
global.createMockContext = () => {
  const context = {
    log: jest.fn(),
    done: jest.fn(),
    res: {},
    bindings: {},
    bindingData: {},
    bindingDefinitions: [],
    invocationId: 'test-invocation-id',
    executionContext: {
      invocationId: 'test-invocation-id',
      functionName: 'test-function',
      functionDirectory: '/test'
    },
    traceContext: {
      traceparent: 'test-trace-parent',
      tracestate: 'test-trace-state',
      attributes: {}
    }
  };

  // Add log methods
  context.log.error = jest.fn();
  context.log.warn = jest.fn();
  context.log.info = jest.fn();
  context.log.verbose = jest.fn();

  return context;
};

// Mock HTTP request
global.createMockRequest = (options = {}) => {
  return {
    method: options.method || 'GET',
    url: options.url || '/',
    originalUrl: options.originalUrl || '/',
    headers: options.headers || {},
    query: options.query || {},
    params: options.params || {},
    body: options.body || null,
    rawBody: options.rawBody || null,
    get: jest.fn((name) => options.headers[name.toLowerCase()]),
    ...options
  };
};

// Environment variable mocks
process.env.NODE_ENV = 'test';
process.env.APIM_VALIDATION_KEY = 'dGVzdC12YWxpZGF0aW9uLWtleQ=='; // base64 encoded 'test-validation-key'
process.env.APIM_PORTAL_URL = 'https://test-apim.developer.azure-api.net';
process.env.OIDC_ISSUER = 'https://test-domain.okta.com';
process.env.OIDC_CLIENT_ID = 'test-client-id';
process.env.OIDC_CLIENT_SECRET = 'test-client-secret';
process.env.OIDC_REDIRECT_URI = 'https://test-function-app.azurewebsites.net/api/auth-callback';
process.env.BASE_URL = 'https://test-function-app.azurewebsites.net';

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Console override for cleaner test output
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Restore console after tests if needed
afterAll(() => {
  global.console = originalConsole;
});