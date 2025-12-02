// Mock the OIDC helper BEFORE any other imports
jest.mock('../shared/oidc-helper');

const delegationFunction = require('../delegation/index');
const { getOidcConfiguration, buildAuthorizationUrl } = require('../shared/oidc-helper');

describe('Delegation Function', () => {
  let context;
  let req;
  const originalEnv = process.env;

  beforeEach(() => {
    context = createMockContext();
    req = createMockRequest();

    // Reset environment variables
    process.env = {
      ...originalEnv,
      APIM_VALIDATION_KEY: Buffer.from('test-validation-key').toString('base64'),
      APIM_PORTAL_URL: 'https://test-apim.developer.azure-api.net'
    };

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Signature Validation', () => {
    test('should reject request with missing signature', async () => {
      req.query = {
        operation: 'SignIn',
        salt: 'test-salt',
        returnUrl: '/test'
      };

      await delegationFunction(context, req);

      expect(context.res.status).toBe(401);
      expect(context.res.body.error).toBe('Invalid signature');
    });

    test('should reject request with invalid signature', async () => {
      req.query = {
        operation: 'SignIn',
        salt: 'test-salt',
        returnUrl: '/test',
        sig: 'invalid-signature'
      };

      await delegationFunction(context, req);

      expect(context.res.status).toBe(401);
      expect(context.res.body.error).toBe('Invalid signature');
    });

    test('should accept request with valid signature for SignIn', async () => {
      const salt = 'test-salt';
      const returnUrl = '/test';

      // Create valid signature using the same logic as the function
      const crypto = require('crypto');
      const keyBytes = Buffer.from(process.env.APIM_VALIDATION_KEY, 'base64');
      const stringToSign = salt + '\n' + returnUrl;
      const hmac = crypto.createHmac('sha512', keyBytes);
      const validSignature = hmac.update(stringToSign, 'utf8').digest('base64');

      req.query = {
        operation: 'SignIn',
        salt: salt,
        returnUrl: returnUrl,
        sig: validSignature
      };

      // Mock OIDC configuration
      const mockOidcConfig = {
        issuer: 'https://test-domain.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback',
        endpoints: {
          authorization_endpoint: 'https://test-domain.okta.com/oauth2/authorize',
          token_endpoint: 'https://test-domain.okta.com/oauth2/token',
          userinfo_endpoint: 'https://test-domain.okta.com/oauth2/userinfo'
        }
      };

      const mockAuthUrl =
        'https://test-domain.okta.com/oauth2/authorize?client_id=test-client-id&response_type=code&state=mock-state';

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);
      buildAuthorizationUrl.mockReturnValue(mockAuthUrl);

      await delegationFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toBe(mockAuthUrl);
      expect(getOidcConfiguration).toHaveBeenCalledWith(context);
      expect(buildAuthorizationUrl).toHaveBeenCalled();
    });

    test('should accept request with valid signature for SignOut with userId', async () => {
      const salt = 'test-salt';
      const userId = 'test-user@example.com';

      // Create valid signature using the same logic as the function
      const crypto = require('crypto');
      const keyBytes = Buffer.from(process.env.APIM_VALIDATION_KEY, 'base64');
      const stringToSign = salt + '\n' + userId;
      const hmac = crypto.createHmac('sha512', keyBytes);
      const validSignature = hmac.update(stringToSign, 'utf8').digest('base64');

      req.query = {
        operation: 'SignOut',
        salt: salt,
        userId: userId,
        returnUrl: '/dashboard',
        sig: validSignature
      };

      // Mock OIDC configuration with logout endpoint
      const mockOidcConfig = {
        endpoints: {
          end_session_endpoint: 'https://test-domain.okta.com/oauth2/logout'
        }
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);

      await delegationFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toContain('https://test-domain.okta.com/oauth2/logout');
    });
  });

  describe('SignIn Operation', () => {
    beforeEach(() => {
      const salt = 'test-salt';
      const returnUrl = '/test';

      const crypto = require('crypto');
      const keyBytes = Buffer.from(process.env.APIM_VALIDATION_KEY, 'base64');
      const stringToSign = salt + '\n' + returnUrl;
      const hmac = crypto.createHmac('sha512', keyBytes);
      const validSignature = hmac.update(stringToSign, 'utf8').digest('base64');

      req.query = {
        operation: 'SignIn',
        salt: salt,
        returnUrl: returnUrl,
        sig: validSignature
      };
    });

    test('should redirect to OIDC authorization endpoint', async () => {
      const mockOidcConfig = {
        issuer: 'https://test-domain.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback'
      };

      const expectedAuthUrl =
        'https://test-domain.okta.com/oauth2/authorize?client_id=test-client-id&response_type=code&redirect_uri=https%3A%2F%2Ftest-function-app.azurewebsites.net%2Fapi%2Fauth-callback&scope=openid+profile+email&state=encoded-state';

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);
      buildAuthorizationUrl.mockReturnValue(expectedAuthUrl);

      await delegationFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toBe(expectedAuthUrl);
      expect(buildAuthorizationUrl).toHaveBeenCalledWith(mockOidcConfig, expect.any(String));
    });

    test('should handle OIDC configuration error', async () => {
      getOidcConfiguration.mockRejectedValue(new Error('OIDC configuration failed'));

      await delegationFunction(context, req);

      expect(context.res.status).toBe(500);
      expect(context.res.body.error).toBe('Server configuration error');
    });

    test('should include correct state data', async () => {
      const mockOidcConfig = {
        issuer: 'https://test-domain.okta.com',
        clientId: 'test-client-id',
        redirectUri: 'https://test-function-app.azurewebsites.net/api/auth-callback'
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);
      buildAuthorizationUrl.mockImplementation((config, encodedState) => {
        // Decode and verify state data
        const stateData = JSON.parse(Buffer.from(encodedState, 'base64').toString());
        expect(stateData.returnUrl).toBe('/test');
        expect(stateData.salt).toBe('test-salt');
        expect(stateData.timestamp).toBeGreaterThan(Date.now() - 5000);
        return 'https://test-auth-url.com';
      });

      await delegationFunction(context, req);

      expect(buildAuthorizationUrl).toHaveBeenCalled();
    });
  });

  describe('SignOut Operation', () => {
    beforeEach(() => {
      const salt = 'test-salt';
      const userId = 'test-user@example.com';

      const crypto = require('crypto');
      const keyBytes = Buffer.from(process.env.APIM_VALIDATION_KEY, 'base64');
      const stringToSign = salt + '\n' + userId;
      const hmac = crypto.createHmac('sha512', keyBytes);
      const validSignature = hmac.update(stringToSign, 'utf8').digest('base64');

      req.query = {
        operation: 'SignOut',
        salt: salt,
        userId: userId,
        returnUrl: '/dashboard',
        sig: validSignature
      };
    });

    test('should redirect to OIDC logout endpoint when available', async () => {
      const mockOidcConfig = {
        endpoints: {
          end_session_endpoint: 'https://test-domain.okta.com/oauth2/logout'
        }
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);

      await delegationFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toContain('https://test-domain.okta.com/oauth2/logout');
      expect(context.res.headers.Location).toContain('post_logout_redirect_uri');
      expect(context.res.headers.Location).toContain('state');
    });

    test('should fallback to APIM portal when no logout endpoint', async () => {
      const mockOidcConfig = {
        endpoints: {}
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);

      await delegationFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toBe(
        'https://test-apim.developer.azure-api.net/dashboard'
      );
    });

    test('should handle OIDC configuration error gracefully', async () => {
      getOidcConfiguration.mockRejectedValue(new Error('OIDC configuration failed'));

      await delegationFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toBe(
        'https://test-apim.developer.azure-api.net/dashboard'
      );
    });

    test('should use default portal URL when APIM_PORTAL_URL not set', async () => {
      delete process.env.APIM_PORTAL_URL;

      const mockOidcConfig = {
        endpoints: {}
      };

      getOidcConfiguration.mockResolvedValue(mockOidcConfig);

      await delegationFunction(context, req);

      expect(context.res.status).toBe(302);
      expect(context.res.headers.Location).toBe('https://localhost/dashboard');
    });
  });

  describe('Unsupported Operations', () => {
    test('should return 400 for unsupported operation', async () => {
      const salt = 'test-salt';
      const userId = 'test-user@example.com';

      const crypto = require('crypto');
      const keyBytes = Buffer.from(process.env.APIM_VALIDATION_KEY, 'base64');
      const stringToSign = salt + '\n' + userId;
      const hmac = crypto.createHmac('sha512', keyBytes);
      const validSignature = hmac.update(stringToSign, 'utf8').digest('base64');

      req.query = {
        operation: 'ChangeProfile', // This is supported in signature validation but not implemented
        salt: salt,
        userId: userId,
        sig: validSignature
      };

      await delegationFunction(context, req);

      expect(context.res.status).toBe(400);
      expect(context.res.body.error).toBe('Unsupported operation');
    });

    test('should support ChangePassword operation signature validation', async () => {
      const salt = 'test-salt';
      const userId = 'test-user@example.com';

      const crypto = require('crypto');
      const keyBytes = Buffer.from(process.env.APIM_VALIDATION_KEY, 'base64');
      const stringToSign = salt + '\n' + userId;
      const hmac = crypto.createHmac('sha512', keyBytes);
      const validSignature = hmac.update(stringToSign, 'utf8').digest('base64');

      req.query = {
        operation: 'ChangePassword',
        salt: salt,
        userId: userId,
        sig: validSignature
      };

      await delegationFunction(context, req);

      // Should pass signature validation but return unsupported operation
      expect(context.res.status).toBe(400);
      expect(context.res.body.error).toBe('Unsupported operation');
    });
  });

  describe('Error Handling', () => {
    test('should handle general errors gracefully', async () => {
      req.query = {
        operation: 'SignIn',
        salt: 'test-salt',
        returnUrl: '/test'
      };

      // Force an error by not providing signature
      await delegationFunction(context, req);

      expect(context.res.status).toBe(401);
      expect(context.res.body.error).toBe('Invalid signature');
    });

    test('should log operation details', async () => {
      req.query = {
        operation: 'SignIn',
        userId: 'test-user',
        salt: 'test-salt',
        returnUrl: '/test'
      };

      await delegationFunction(context, req);

      expect(context.log).toHaveBeenCalledWith('Delegation endpoint called');
      expect(context.log).toHaveBeenCalledWith('Operation:', 'SignIn');
      expect(context.log).toHaveBeenCalledWith('UserId:', 'test-user');
      expect(context.log).toHaveBeenCalledWith('ReturnUrl:', '/test');
      expect(context.log).toHaveBeenCalledWith('Salt:', 'test-salt');
    });
  });
});
