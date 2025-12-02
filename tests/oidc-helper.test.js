// Mock the https module BEFORE imports
jest.mock('https', () => ({
  get: jest.fn()
}));

const {
  getOidcConfig,
  discoverOidcEndpoints,
  getOidcConfiguration,
  buildAuthorizationUrl,
  validateOidcConfig,
  clearDiscoveryCache
} = require('../shared/oidc-helper');

const https = require('https');

describe('OIDC Helper', () => {
  const originalEnv = process.env;
  let context;

  beforeEach(() => {
    context = createMockContext();

    // Reset environment variables with defaults
    process.env = {
      ...originalEnv,
      OIDC_ISSUER: 'https://test-domain.okta.com',
      OIDC_CLIENT_ID: 'test-client-id',
      OIDC_CLIENT_SECRET: 'test-client-secret',
      OIDC_REDIRECT_URI: 'https://test-function-app.azurewebsites.net/api/auth-callback'
    };

    // Reset all mocks and clear cache
    jest.clearAllMocks();
    clearDiscoveryCache();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getOidcConfig', () => {
    test('should return valid OIDC configuration', () => {
      const config = getOidcConfig();

      expect(config).toEqual({
        issuer: 'https://test-domain.okta.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback'
      });
    });

    test('should throw error when OIDC_ISSUER is missing', () => {
      delete process.env.OIDC_ISSUER;

      expect(() => {
        getOidcConfig();
      }).toThrow('Missing required OIDC configuration');
    });

    test('should throw error when OIDC_CLIENT_ID is missing', () => {
      delete process.env.OIDC_CLIENT_ID;

      expect(() => {
        getOidcConfig();
      }).toThrow('Missing required OIDC configuration');
    });

    test('should throw error when OIDC_CLIENT_SECRET is missing', () => {
      delete process.env.OIDC_CLIENT_SECRET;

      expect(() => {
        getOidcConfig();
      }).toThrow('Missing required OIDC configuration');
    });

    test('should throw error when OIDC_REDIRECT_URI is missing', () => {
      delete process.env.OIDC_REDIRECT_URI;

      expect(() => {
        getOidcConfig();
      }).toThrow('Missing required OIDC configuration');
    });
  });

  describe('discoverOidcEndpoints', () => {
    test('should discover endpoints from .well-known endpoint', async () => {
      const mockDiscoveryResponse = {
        issuer: 'https://test-domain.okta.com',
        authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize',
        token_endpoint: 'https://test-domain.okta.com/oauth2/token',
        userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo',
        end_session_endpoint: 'https://test-domain.okta.com/oauth2/logout'
      };

      https.get.mockImplementationOnce((url, callback) => {
        expect(url).toBe('https://test-domain.okta.com/.well-known/openid-configuration');

        const response = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(JSON.stringify(mockDiscoveryResponse));
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(response);
        return { on: jest.fn() };
      });

      const endpoints = await discoverOidcEndpoints('https://test-domain.okta.com', context);

      expect(endpoints).toEqual({
        authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize',
        token_endpoint: 'https://test-domain.okta.com/oauth2/token',
        userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo',
        end_session_endpoint: 'https://test-domain.okta.com/oauth2/logout',
        issuer: 'https://test-domain.okta.com'
      });

      expect(context.log).toHaveBeenCalledWith(
        'Discovering OIDC endpoints for:',
        'https://test-domain.okta.com'
      );
      expect(context.log).toHaveBeenCalledWith('OIDC endpoints discovered:', expect.any(Object));
    });

    test('should fallback to manual configuration when discovery fails', async () => {
      https.get.mockImplementationOnce((url, callback) => {
        const response = {
          statusCode: 404,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback('Not Found');
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(response);
        return { on: jest.fn() };
      });

      const endpoints = await discoverOidcEndpoints('https://test-domain.okta.com', context);

      expect(endpoints).toEqual({
        authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize',
        token_endpoint: 'https://test-domain.okta.com/oauth2/token',
        userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo',
        end_session_endpoint: undefined,
        issuer: 'https://test-domain.okta.com'
      });

      expect(context.log).toHaveBeenCalledWith(
        'OIDC discovery failed, falling back to manual configuration:',
        expect.any(String)
      );
      expect(context.log).toHaveBeenCalledWith('Using fallback endpoints:', expect.any(Object));
    });

    test('should use custom endpoint paths in fallback', async () => {
      process.env.OIDC_AUTHORIZATION_ENDPOINT = '/auth/authorize';
      process.env.OIDC_TOKEN_ENDPOINT = '/auth/token';
      process.env.OIDC_USERINFO_ENDPOINT = '/auth/userinfo';
      process.env.OIDC_END_SESSION_ENDPOINT = '/auth/logout';

      https.get.mockImplementationOnce((url, callback) => {
        const response = {
          statusCode: 500,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback('Internal Server Error');
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(response);
        return { on: jest.fn() };
      });

      const endpoints = await discoverOidcEndpoints('https://test-domain.okta.com', context);

      expect(endpoints).toEqual({
        authorization_endpoint: 'https://test-domain.okta.com/auth/authorize',
        token_endpoint: 'https://test-domain.okta.com/auth/token',
        userinfo_endpoint: 'https://test-domain.okta.com/auth/userinfo',
        end_session_endpoint: 'https://test-domain.okta.com/auth/logout',
        issuer: 'https://test-domain.okta.com'
      });
    });

    test('should handle network errors gracefully', async () => {
      https.get.mockImplementationOnce((_url, _callback) => {
        return {
          on: jest.fn((event, callback) => {
            if (event === 'error') {
              callback(new Error('Network error'));
            }
          })
        };
      });

      const endpoints = await discoverOidcEndpoints('https://test-domain.okta.com', context);

      expect(endpoints.authorization_endpoint).toBe(
        'https://test-domain.okta.com/oauth2/authorize'
      );
      expect(context.log).toHaveBeenCalledWith(
        'OIDC discovery failed, falling back to manual configuration:',
        'Network error'
      );
    });
  });

  describe('getOidcConfiguration', () => {
    test('should return complete OIDC configuration with endpoints', async () => {
      const mockDiscoveryResponse = {
        issuer: 'https://test-domain.okta.com',
        authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize',
        token_endpoint: 'https://test-domain.okta.com/oauth2/token',
        userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo'
      };

      https.get.mockImplementationOnce((url, callback) => {
        const response = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback(JSON.stringify(mockDiscoveryResponse));
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(response);
        return { on: jest.fn() };
      });

      const config = await getOidcConfiguration(context);

      expect(config).toEqual({
        issuer: 'https://test-domain.okta.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback',
        endpoints: {
          authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize',
          token_endpoint: 'https://test-domain.okta.com/oauth2/token',
          userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo',
          end_session_endpoint: undefined,
          issuer: 'https://test-domain.okta.com'
        }
      });
    });

    test('should throw error when basic config is invalid', async () => {
      delete process.env.OIDC_CLIENT_ID;

      await expect(getOidcConfiguration(context)).rejects.toThrow(
        'Missing required OIDC configuration'
      );
    });
  });

  describe('buildAuthorizationUrl', () => {
    test('should build correct authorization URL with default scopes', () => {
      const mockConfig = {
        clientId: 'test-client-id',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback',
        endpoints: {
          authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize'
        }
      };

      const state = 'encoded-state-data';
      const authUrl = buildAuthorizationUrl(mockConfig, state);

      expect(authUrl).toBe(
        'https://test-domain.okta.com/oauth2/authorize?' +
          'client_id=test-client-id&' +
          'response_type=code&' +
          'scope=openid+profile+email&' +
          'redirect_uri=https%3A%2F%2Ftest-function-app.azurewebsites.net%2Fapi%2Fauth-callback&' +
          'state=encoded-state-data'
      );
    });

    test('should build authorization URL with custom scopes', () => {
      const mockConfig = {
        clientId: 'test-client-id',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback',
        endpoints: {
          authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize'
        }
      };

      const state = 'encoded-state-data';
      const customScopes = 'openid profile email groups';
      const authUrl = buildAuthorizationUrl(mockConfig, state, customScopes);

      expect(authUrl).toContain('scope=openid+profile+email+groups');
    });

    test('should properly encode redirect URI and state', () => {
      const mockConfig = {
        clientId: 'test-client-id',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback?param=value',
        endpoints: {
          authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize'
        }
      };

      const state = 'state with spaces and special chars!@#$%';
      const authUrl = buildAuthorizationUrl(mockConfig, state);

      expect(authUrl).toContain(
        'redirect_uri=https%3A%2F%2Ftest-function-app.azurewebsites.net%2Fapi%2Fauth-callback%3Fparam%3Dvalue'
      );
      expect(authUrl).toContain('state=state+with+spaces+and+special+chars%21%40%23%24%25');
    });
  });

  describe('validateOidcConfig', () => {
    test('should return true for valid configuration', () => {
      const result = validateOidcConfig();
      expect(result).toBe(true);
    });

    test('should return false for invalid configuration', () => {
      delete process.env.OIDC_CLIENT_ID;

      const result = validateOidcConfig();
      expect(result).toBe(false);
    });

    test('should return false when all environment variables are missing', () => {
      process.env = {};

      const result = validateOidcConfig();
      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON in discovery response', async () => {
      https.get.mockImplementationOnce((url, callback) => {
        const response = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback('invalid-json-response');
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(response);
        return { on: jest.fn() };
      });

      const endpoints = await discoverOidcEndpoints('https://test-domain.okta.com', context);

      // Should fallback to manual configuration
      expect(endpoints.authorization_endpoint).toBe(
        'https://test-domain.okta.com/oauth2/authorize'
      );
      expect(context.log).toHaveBeenCalledWith(
        'OIDC discovery failed, falling back to manual configuration:',
        expect.stringContaining('Failed to parse response')
      );
    });

    test('should handle empty discovery response', async () => {
      https.get.mockImplementationOnce((url, callback) => {
        const response = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'data') {
              callback('');
            } else if (event === 'end') {
              callback();
            }
          })
        };
        callback(response);
        return { on: jest.fn() };
      });

      const endpoints = await discoverOidcEndpoints('https://test-domain.okta.com', context);

      // Should fallback to manual configuration
      expect(endpoints.authorization_endpoint).toBe(
        'https://test-domain.okta.com/oauth2/authorize'
      );
    });
  });
});
