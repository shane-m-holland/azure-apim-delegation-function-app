// wwwroot/auth-callback/index.js
const https = require('https');
const { getOidcConfiguration } = require('../shared/oidc-helper');

// Helper function to make HTTP POST requests
function httpPost(url, postData, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      servername: urlObj.hostname, // Enable SNI for custom domains
      minVersion: 'TLSv1.2', // Support TLS 1.2 and above (including 1.3)
      maxVersion: 'TLSv1.3', // Allow up to TLS 1.3
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Helper function to get Azure access token (Managed Identity or manual)
async function getAzureAccessToken(context) {
  const manualToken = process.env.APIM_ACCESS_TOKEN;
    
  // If manual token is provided (cross-subscription scenario), use it
  if (manualToken) {
    context.log('Using provided APIM_ACCESS_TOKEN for authentication');
    return manualToken;
  }
    
  // Otherwise, use Managed Identity (same-subscription scenario)
  context.log('Using Managed Identity for authentication');
  const identityEndpoint = process.env.IDENTITY_ENDPOINT;
  const identityHeader = process.env.IDENTITY_HEADER;
    
  if (!identityEndpoint || !identityHeader) {
    throw new Error('Managed Identity not available. Either provide APIM_ACCESS_TOKEN or ensure Function App has System-Assigned Managed Identity enabled.');
  }
    
  const tokenUrl = `${identityEndpoint}?resource=https://management.azure.com/&api-version=2019-08-01`;
    
  return new Promise((resolve, reject) => {
    const urlObj = new URL(tokenUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      servername: urlObj.hostname, // Enable SNI for custom domains
      minVersion: 'TLSv1.2', // Support TLS 1.2 and above (including 1.3)
      maxVersion: 'TLSv1.3', // Allow up to TLS 1.3
      headers: {
        'X-IDENTITY-HEADER': identityHeader
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error(`Failed to get managed identity token: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse managed identity response: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

// Helper function to create or update user in APIM
async function createOrUpdateUserInAPIM(userId, userData, context) {
  const subscriptionId = process.env.APIM_SUBSCRIPTION_ID;
  const resourceGroup = process.env.APIM_RESOURCE_GROUP;
  const serviceName = process.env.APIM_SERVICE_NAME;
    
  if (!subscriptionId || !resourceGroup || !serviceName) {
    throw new Error('Missing APIM configuration: APIM_SUBSCRIPTION_ID, APIM_RESOURCE_GROUP, APIM_SERVICE_NAME');
  }
    
  const accessToken = await getAzureAccessToken(context);
    
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ApiManagement/service/${serviceName}/users/${userId}?api-version=2021-08-01`;
    
  const userPayload = {
    properties: {
      firstName: userData.firstName,
      lastName: userData.lastName,
      email: userData.email,
      state: 'active',
      note: userData.note
    }
  };
    
  return httpPutJson(url, userPayload, {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  });
}

// Helper function to get shared access token from APIM
async function getSharedAccessToken(userId, context) {
  const subscriptionId = process.env.APIM_SUBSCRIPTION_ID;
  const resourceGroup = process.env.APIM_RESOURCE_GROUP;
  const serviceName = process.env.APIM_SERVICE_NAME;
    
  const accessToken = await getAzureAccessToken(context);
    
  const url = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ApiManagement/service/${serviceName}/users/${userId}/generateSsoUrl?api-version=2021-08-01`;
    
  const response = await httpPostJson(url, {}, {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  });
    
  return response.value; // The SSO URL contains the token
}

// Helper function to make HTTP PUT requests with JSON
function httpPutJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
        
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'PUT',
      servername: urlObj.hostname, // Enable SNI for custom domains
      minVersion: 'TLSv1.2', // Support TLS 1.2 and above (including 1.3)
      maxVersion: 'TLSv1.3', // Allow up to TLS 1.3
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(responseData || '{}'));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Helper function to make HTTP POST requests with JSON
function httpPostJson(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
        
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      servername: urlObj.hostname, // Enable SNI for custom domains
      minVersion: 'TLSv1.2', // Support TLS 1.2 and above (including 1.3)
      maxVersion: 'TLSv1.3', // Allow up to TLS 1.3
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => {
        responseData += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(responseData || '{}'));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
function httpGetWithAuth(url, accessToken) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      servername: urlObj.hostname, // Enable SNI for custom domains
      minVersion: 'TLSv1.2', // Support TLS 1.2 and above (including 1.3)
      maxVersion: 'TLSv1.3', // Allow up to TLS 1.3
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

module.exports = async function (context, req) {
  context.log('Auth callback endpoint called');

  try {
    const code = req.query.code;
    const encodedState = req.query.state;

    context.log('Received code:', code ? 'present' : 'missing');
    context.log('Received state:', encodedState ? 'present' : 'missing');

    if (!code || !encodedState) {
      context.log.error('Missing code or state parameter');
      context.res = {
        status: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: { error: 'Missing code or state parameter' }
      };
      return;
    }

    // Decode state data
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(encodedState, 'base64').toString());
      context.log('State data decoded successfully');
    } catch (error) {
      context.log.error('Failed to decode state:', error);
      context.res = {
        status: 400,
        body: { error: 'Invalid state parameter' }
      };
      return;
    }

    // Check state timestamp (expire after 10 minutes)
    if (Date.now() - stateData.timestamp > 600000) {
      context.log.error('State parameter expired');
      context.res = {
        status: 400,
        body: { error: 'State parameter expired' }
      };
      return;
    }

    // Get OIDC configuration with endpoint discovery
    let oidcConfig;
    try {
      oidcConfig = await getOidcConfiguration(context);
      context.log('OIDC configuration loaded successfully');
    } catch (error) {
      context.log.error('Failed to load OIDC configuration:', error.message);
      context.res = {
        status: 500,
        body: { error: 'Server configuration error' }
      };
      return;
    }

    // Exchange code for token
    context.log('Exchanging code for token...');
    const tokenData = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: oidcConfig.redirectUri,
      client_id: oidcConfig.clientId,
      client_secret: oidcConfig.clientSecret
    }).toString();

    const tokenUrl = oidcConfig.endpoints.token_endpoint;
    context.log('Token URL:', tokenUrl);
        
    const tokenResponse = await httpPost(tokenUrl, tokenData);
        
    if (tokenResponse.error) {
      context.log.error('Token exchange failed:', tokenResponse.error_description);
      throw new Error(`Token exchange failed: ${tokenResponse.error_description}`);
    }

    context.log('Token exchange successful');
    context.log('Access token present:', !!tokenResponse.access_token);

    // Get user info using Authorization header (more reliable than query param)
    context.log('Fetching user info...');
    const userInfoUrl = oidcConfig.endpoints.userinfo_endpoint;
    context.log('User info URL:', userInfoUrl);
        
    // Use Authorization header instead of query parameter
    const userInfo = await httpGetWithAuth(userInfoUrl, tokenResponse.access_token);

    context.log('User info retrieved:', {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name
    });

    // Prepare user data for APIM
    const userData = {
      userId: userInfo.sub,
      email: userInfo.email,
      firstName: userInfo.given_name || userInfo.name?.split(' ')[0] || '',
      lastName: userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' ') || '',
      registrationDate: new Date().toISOString(),
      note: 'User authenticated via Okta'
    };

    context.log('User data for APIM:', userData);

    // According to Microsoft docs, we need to:
    // 1. Create/update user in APIM via REST API
    // 2. Request a shared access token from APIM
    // 3. Redirect to the SSO URL with the token

    try {
      // Step 1: Create or update user in APIM
      const apimUserId = userData.email.replace('@', '_').replace(/\./g, '_'); // APIM-safe user ID
            
      await createOrUpdateUserInAPIM(apimUserId, userData, context);
            
      // Step 2: Get shared access token for the user
      const ssoResponse = await getSharedAccessToken(apimUserId, context);
            
      context.log('Raw SSO response from APIM:', ssoResponse);
      context.log('SSO response type:', typeof ssoResponse);
            
      // Step 3: The APIM API returns a complete SSO URL, but sometimes with wrong domain
      // We need to use the developer portal URL and append the returnUrl
      let ssoUrl;
      if (ssoResponse && ssoResponse.indexOf && ssoResponse.indexOf('signin-sso') !== -1) {
        // APIM returned a complete SSO URL, but fix the domain
        ssoUrl = ssoResponse;
                
        // Replace .portal.azure-api.net with .developer.azure-api.net
        ssoUrl = ssoUrl.replace('.portal.azure-api.net', '.developer.azure-api.net');
                
        // Append returnUrl if not already present
        if (ssoUrl.indexOf('returnUrl=') === -1) {
          const separator = ssoUrl.indexOf('?') !== -1 ? '&' : '?';
          ssoUrl += `${separator}returnUrl=${encodeURIComponent(stateData.returnUrl)}`;
        }
        context.log('Using SSO URL from APIM (with corrected domain)');
      } else {
        // Fallback: construct SSO URL manually using developer portal URL
        const baseUrl = process.env.APIM_PORTAL_URL || 'https://afdevapi.developer.azure-api.net';
        ssoUrl = `${baseUrl}/signin-sso?token=${encodeURIComponent(ssoResponse)}&returnUrl=${encodeURIComponent(stateData.returnUrl)}`;
        context.log('Constructed SSO URL manually');
      }
            
      context.log('Final SSO URL:', ssoUrl);
            
      context.res = {
        status: 302,
        headers: {
          'Location': ssoUrl
        }
      };
            
    } catch (apimError) {
      context.log.error('APIM API error:', apimError);
            
      // Fallback: try the direct parameter approach
      let returnUrl;
      if (stateData.returnUrl.startsWith('http')) {
        returnUrl = new URL(stateData.returnUrl);
      } else {
        const baseUrl = process.env.APIM_PORTAL_URL || 'https://afdevapi.developer.azure-api.net';
        returnUrl = new URL(stateData.returnUrl, baseUrl);
      }
            
      Object.entries(userData).forEach(([key, value]) => {
        if (value) returnUrl.searchParams.set(key, value);
      });
      returnUrl.searchParams.set('salt', stateData.salt);
            
      context.log('Fallback: Redirecting with parameters:', returnUrl.toString());
            
      context.res = {
        status: 302,
        headers: { 'Location': returnUrl.toString() }
      };
    }

  } catch (error) {
    context.log.error('Auth callback error:', error);
    context.res = {
      status: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: { 
        error: 'Authentication failed', 
        details: error.message 
      }
    };
  }
};