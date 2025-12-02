// Mock the modules BEFORE imports
jest.mock('../shared/oidc-helper');
jest.mock('https', () => ({
  request: jest.fn(),
  get: jest.fn(),
  Agent: jest.fn().mockImplementation(() => ({}))
}));
jest.mock('http', () => ({
  request: jest.fn(),
  get: jest.fn()
}));

const authCallbackFunction = require('../auth-callback/index');
const { getOidcConfiguration } = require('../shared/oidc-helper');
const https = require('https');

describe('Auth Callback Function', () => {
  let context;
  let req;
  const originalEnv = process.env;

  beforeEach(() => {
    context = createMockContext();
    req = createMockRequest();

    // Reset environment variables
    process.env = {
      ...originalEnv,
      APIM_SUBSCRIPTION_ID: 'test-subscription-id',
      APIM_RESOURCE_GROUP: 'test-resource-group',
      APIM_SERVICE_NAME: 'test-apim-service',
      APIM_PORTAL_URL: 'https://test-apim.developer.azure-api.net'
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Input Validation', () => {
    test('should return 400 when code is missing', async () => {
      req.query = {
        state: Buffer.from(JSON.stringify({ timestamp: Date.now() })).toString('base64')
      };

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(400);
      expect(context.res.body.error).toBe('Missing code or state parameter');
    });

    test('should return 400 when state is missing', async () => {
      req.query = {
        code: 'test-code'
      };

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(400);
      expect(context.res.body.error).toBe('Missing code or state parameter');
    });

    test('should return 400 when state is invalid JSON', async () => {
      req.query = {
        code: 'test-code',
        state: 'invalid-base64'
      };

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(400);
      expect(context.res.body.error).toBe('Invalid state parameter');
    });

    test('should return 400 when state is expired', async () => {
      const expiredTimestamp = Date.now() - 11 * 60 * 1000; // 11 minutes ago
      req.query = {
        code: 'test-code',
        state: Buffer.from(
          JSON.stringify({
            timestamp: expiredTimestamp,
            returnUrl: '/test',
            salt: 'test-salt'
          })
        ).toString('base64')
      };

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(400);
      expect(context.res.body.error).toBe('State parameter expired');
    });
  });

  describe('OIDC Configuration Loading', () => {
    beforeEach(() => {
      req.query = {
        code: 'test-code',
        state: Buffer.from(
          JSON.stringify({
            timestamp: Date.now(),
            returnUrl: '/test',
            salt: 'test-salt'
          })
        ).toString('base64')
      };
    });

    test('should handle OIDC configuration error', async () => {
      getOidcConfiguration.mockRejectedValue(new Error('OIDC configuration failed'));

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(500);
      expect(context.res.body.error).toBe('Server configuration error');
    });

    test('should load OIDC configuration successfully and complete flow', async () => {
      const mockOidcConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback',
        endpoints: {
          token_endpoint: 'https://test-domain.okta.com/oauth2/token',
          userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo'
        }
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);

      // Mock successful token exchange
      const mockTokenRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      https.request.mockImplementationOnce((options, callback) => {
        const tokenResponse = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(JSON.stringify({ access_token: 'test-access-token' }));
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(tokenResponse);
        return mockTokenRequest;
      });

      // Mock successful userinfo request
      https.get.mockImplementationOnce((options, callback) => {
        const userinfoResponse = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(
                JSON.stringify({
                  sub: 'user123',
                  email: 'user@example.com',
                  given_name: 'Test',
                  family_name: 'User'
                })
              );
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(userinfoResponse);
        return { on: jest.fn() };
      });

      // Mock APIM user creation - provide access token
      process.env.APIM_ACCESS_TOKEN = 'test-apim-token';

      // Mock APIM user creation request
      https.request.mockImplementationOnce((options, callback) => {
        const apimResponse = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(JSON.stringify({ id: 'user123' }));
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(apimResponse);
        return mockTokenRequest;
      });

      // Mock SSO token request
      https.request.mockImplementationOnce((options, callback) => {
        const ssoResponse = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(
                JSON.stringify({
                  value:
                    'https://test-apim.developer.azure-api.net/signin-sso?token=sso-token&returnUrl=%2Ftest'
                })
              );
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(ssoResponse);
        return mockTokenRequest;
      });

      await authCallbackFunction(context, req);

      expect(getOidcConfiguration).toHaveBeenCalledWith(context);
      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toContain('signin-sso');
    });
  });

  describe('Token Exchange', () => {
    let mockOidcConfig;

    beforeEach(() => {
      req.query = {
        code: 'test-authorization-code',
        state: Buffer.from(
          JSON.stringify({
            timestamp: Date.now(),
            returnUrl: '/test',
            salt: 'test-salt'
          })
        ).toString('base64')
      };

      mockOidcConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback',
        endpoints: {
          token_endpoint: 'https://test-domain.okta.com/oauth2/token',
          userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo'
        }
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);
    });

    test('should handle token exchange error', async () => {
      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      https.request.mockImplementationOnce((options, callback) => {
        const errorResponse = {
          statusCode: 400,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(
                JSON.stringify({
                  error: 'invalid_grant',
                  error_description: 'Authorization code is invalid'
                })
              );
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(errorResponse);
        return mockRequest;
      });

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(500);
      expect(context.res.body.error).toBe('Authentication failed');
    });
  });

  describe('Fallback Handling', () => {
    beforeEach(() => {
      req.query = {
        code: 'test-code',
        state: Buffer.from(
          JSON.stringify({
            timestamp: Date.now(),
            returnUrl: '/test',
            salt: 'test-salt'
          })
        ).toString('base64')
      };
    });

    test('should fallback when APIM API fails', async () => {
      const mockOidcConfig = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback',
        endpoints: {
          token_endpoint: 'https://test-domain.okta.com/oauth2/token',
          userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo'
        }
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);

      const mockRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn()
      };

      // Mock successful token exchange
      https.request.mockImplementationOnce((options, callback) => {
        const tokenResponse = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(JSON.stringify({ access_token: 'test-access-token' }));
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(tokenResponse);
        return mockRequest;
      });

      // Mock successful userinfo request
      https.get.mockImplementationOnce((options, callback) => {
        const userinfoResponse = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(
                JSON.stringify({
                  sub: 'user123',
                  email: 'user@example.com',
                  given_name: 'Test',
                  family_name: 'User'
                })
              );
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(userinfoResponse);
        return { on: jest.fn() };
      });

      // Mock APIM user creation failure
      process.env.APIM_ACCESS_TOKEN = 'test-apim-token';

      https.request.mockImplementationOnce((options, callback) => {
        const errorResponse = {
          statusCode: 500,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback('Internal Server Error');
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(errorResponse);
        return mockRequest;
      });

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toContain('/test');
    });
  });

  describe('Error Handling', () => {
    test('should handle general errors', async () => {
      req.query = {
        code: 'test-code',
        state: Buffer.from(
          JSON.stringify({
            timestamp: Date.now(),
            returnUrl: '/test',
            salt: 'test-salt'
          })
        ).toString('base64')
      };

      getOidcConfiguration.mockRejectedValue(new Error('Unexpected error'));

      await authCallbackFunction(context, req);

      expect(context.res.status).toBe(500);
      expect(context.res.body.error).toBe('Server configuration error');
    });
  });
});
