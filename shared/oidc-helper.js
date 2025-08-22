const https = require('https');

// Cache for OIDC discovery to avoid repeated requests
const discoveryCache = new Map();
const CACHE_TTL = 3600000; // 1 hour

/**
 * Get OIDC configuration
 */
function getOidcConfig() {
  const issuer = process.env.OIDC_ISSUER;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  const redirectUri = process.env.OIDC_REDIRECT_URI;

  if (!issuer || !clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing required OIDC configuration. Please set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_REDIRECT_URI');
  }

  return { issuer, clientId, clientSecret, redirectUri };
}

/**
 * Helper function to make HTTPS GET requests
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Discover OIDC endpoints using the .well-known/openid_configuration endpoint
 */
async function discoverOidcEndpoints(issuer, context) {
  const cacheKey = issuer;
  const cached = discoveryCache.get(cacheKey);

  // Return cached result if still valid
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    context?.log('Using cached OIDC discovery for:', issuer);
    return cached.endpoints;
  }

  try {
    context?.log('Discovering OIDC endpoints for:', issuer);
    const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
    const config = await httpsGet(discoveryUrl);

    const endpoints = {
      authorization_endpoint: config.authorization_endpoint,
      token_endpoint: config.token_endpoint,
      userinfo_endpoint: config.userinfo_endpoint,
      end_session_endpoint: config.end_session_endpoint,
      issuer: config.issuer
    };

    // Cache the result
    discoveryCache.set(cacheKey, {
      endpoints,
      timestamp: Date.now()
    });

    context?.log('OIDC endpoints discovered:', endpoints);
    return endpoints;

  } catch (error) {
    context?.log('OIDC discovery failed, falling back to manual configuration:', error.message);

    // Fallback to manual endpoint construction using custom paths
    const authPath = process.env.OIDC_AUTHORIZATION_ENDPOINT || '/oauth2/authorize';
    const tokenPath = process.env.OIDC_TOKEN_ENDPOINT || '/oauth2/token';
    const userinfoPath = process.env.OIDC_USERINFO_ENDPOINT || '/oauth2/userinfo';
    const logoutPath = process.env.OIDC_END_SESSION_ENDPOINT;

    const endpoints = {
      authorization_endpoint: `${issuer}${authPath}`,
      token_endpoint: `${issuer}${tokenPath}`,
      userinfo_endpoint: `${issuer}${userinfoPath}`,
      end_session_endpoint: logoutPath ? `${issuer}${logoutPath}` : undefined,
      issuer: issuer
    };

    context?.log('Using fallback endpoints:', endpoints);
    return endpoints;
  }
}

/**
 * Get complete OIDC configuration with discovered endpoints
 */
async function getOidcConfiguration(context) {
  const config = getOidcConfig();
  const endpoints = await discoverOidcEndpoints(config.issuer, context);

  return {
    ...config,
    endpoints
  };
}

/**
 * Build authorization URL for OAuth 2.0 flow
 */
function buildAuthorizationUrl(oidcConfig, state, scopes = 'openid profile email') {
  const authParams = new URLSearchParams({
    client_id: oidcConfig.clientId,
    response_type: 'code',
    scope: scopes,
    redirect_uri: oidcConfig.redirectUri,
    state: state
  });

  return `${oidcConfig.endpoints.authorization_endpoint}?${authParams.toString()}`;
}

/**
 * Validate OIDC configuration at startup
 */
function validateOidcConfig() {
  try {
    getOidcConfig();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Clear the discovery cache (useful for testing)
 */
function clearDiscoveryCache() {
  discoveryCache.clear();
}

module.exports = {
  getOidcConfig,
  discoverOidcEndpoints,
  getOidcConfiguration,
  buildAuthorizationUrl,
  validateOidcConfig,
  clearDiscoveryCache
};