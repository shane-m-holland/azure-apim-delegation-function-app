# API Documentation

This document provides detailed information about the Azure APIM Authentication Delegation Function App endpoints.

## 📋 Overview

The function app exposes three HTTP endpoints that handle the APIM delegation authentication flow:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/delegation` | GET, POST | Handles APIM delegation requests |
| `/api/auth-callback` | GET | Processes OAuth callbacks from Okta |
| `/api/health` | GET, POST | Health check endpoint |

## 🔗 Endpoints

### 1. Delegation Endpoint

**Endpoint**: `/api/delegation`  
**Methods**: `GET`, `POST`  
**Purpose**: Handles APIM delegation requests and initiates OAuth flow

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | string | Yes | Operation type (`SignIn`, `SignUp`, `ChangePassword`, etc.) |
| `returnUrl` | string | Yes | URL to return to after authentication |
| `salt` | string | Yes | Random salt for signature validation |
| `userId` | string | No | User ID (required for some operations) |
| `sig` | string | Yes | HMAC-SHA512 signature for request validation |

#### Example Request

```http
GET /api/delegation?operation=SignIn&returnUrl=https%3A%2F%2Fcontoso.developer.azure-api.net%2F&salt=abc123&sig=signature_here HTTP/1.1
Host: your-function-app.azurewebsites.net
```

#### Response Codes

| Code | Description | Response Body |
|------|-------------|---------------|
| 302 | Redirect to Okta authorization | Location header with OAuth URL |
| 400 | Bad request | `{"error": "Unsupported operation"}` |
| 401 | Invalid signature | `{"error": "Invalid signature"}` |
| 500 | Server error | `{"error": "Internal server error", "details": "..."}` |

#### Signature Validation

The signature is calculated using HMAC-SHA512:

```javascript
// String to sign construction
let stringToSign;
switch (operation) {
  case 'SignIn':
  case 'SignUp':
    stringToSign = salt + '\n' + returnUrl;
    break;
  case 'ChangePassword':
  case 'ChangeProfile':
  case 'CloseAccount':
  case 'SignOut':
    stringToSign = salt + '\n' + userId;
    break;
}

// Signature calculation
const keyBytes = Buffer.from(validationKey, 'base64');
const hmac = crypto.createHmac('sha512', keyBytes);
const signature = hmac.update(stringToSign, 'utf8').digest('base64');
```

#### Example Signature Generation (Node.js)

```javascript
const crypto = require('crypto');

function generateSignature(operation, salt, returnUrl, userId, validationKey) {
  let stringToSign;
  
  if (operation === 'SignIn' || operation === 'SignUp') {
    stringToSign = salt + '\n' + returnUrl;
  } else {
    stringToSign = salt + '\n' + userId;
  }
  
  const keyBytes = Buffer.from(validationKey, 'base64');
  const hmac = crypto.createHmac('sha512', keyBytes);
  return hmac.update(stringToSign, 'utf8').digest('base64');
}

// Usage
const signature = generateSignature(
  'SignIn',
  'randomSalt123',
  'https://contoso.developer.azure-api.net/',
  null,
  'base64EncodedValidationKey'
);
```

### 2. Auth Callback Endpoint

**Endpoint**: `/api/auth-callback`  
**Methods**: `GET`  
**Purpose**: Processes OAuth callbacks from Okta and completes APIM authentication

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | OAuth authorization code from Okta |
| `state` | string | Yes | Base64-encoded state data from delegation request |
| `error` | string | No | OAuth error code (if authentication failed) |
| `error_description` | string | No | Human-readable error description |

#### Example Request

```http
GET /api/auth-callback?code=oauth_code_here&state=base64_encoded_state HTTP/1.1
Host: your-function-app.azurewebsites.net
```

#### State Parameter Format

The state parameter contains base64-encoded JSON:

```javascript
// State data structure
const stateData = {
  returnUrl: 'https://contoso.developer.azure-api.net/',
  salt: 'randomSalt123',
  userId: null,
  timestamp: 1640995200000
};

// Encoding
const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64');

// Decoding
const decodedState = JSON.parse(Buffer.from(encodedState, 'base64').toString());
```

#### Response Codes

| Code | Description | Response Body |
|------|-------------|---------------|
| 302 | Redirect to APIM with SSO token | Location header with APIM SSO URL |
| 400 | Bad request | `{"error": "Missing code or state parameter"}` |
| 400 | Expired state | `{"error": "State parameter expired"}` |
| 500 | Server error | `{"error": "Authentication failed", "details": "..."}` |

#### OAuth Flow Details

1. **Token Exchange**
   ```http
   POST /v1/token HTTP/1.1
   Host: your-domain.okta.com
   Content-Type: application/x-www-form-urlencoded
   
   grant_type=authorization_code&
   code=oauth_code&
   redirect_uri=https://your-function-app.azurewebsites.net/api/auth-callback&
   client_id=your_client_id&
   client_secret=your_client_secret
   ```

2. **User Info Retrieval**
   ```http
   GET /v1/userinfo HTTP/1.1
   Host: your-domain.okta.com
   Authorization: Bearer access_token
   ```

3. **APIM User Creation**
   ```http
   PUT /subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.ApiManagement/service/{serviceName}/users/{userId}?api-version=2021-08-01 HTTP/1.1
   Host: management.azure.com
   Authorization: Bearer azure_access_token
   Content-Type: application/json
   
   {
     "properties": {
       "firstName": "John",
       "lastName": "Doe",
       "email": "john.doe@example.com",
       "state": "active"
     }
   }
   ```

### 3. Health Check Endpoint

**Endpoint**: `/api/health`  
**Methods**: `GET`, `POST`  
**Purpose**: Health check for monitoring and load balancers

#### Request

```http
GET /api/health HTTP/1.1
Host: your-function-app.azurewebsites.net
```

#### Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Response Codes

| Code | Description |
|------|-------------|
| 200 | Service is healthy |

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `APIM_VALIDATION_KEY` | Yes | Base64-encoded APIM validation key | `aW50ZWdyYXRpb24...` |
| `APIM_PORTAL_URL` | Yes | APIM Developer Portal URL | `https://contoso.developer.azure-api.net` |
| `OKTA_ISSUER` | Yes | Okta domain issuer URL | `https://dev-123456.okta.com` |
| `OKTA_CLIENT_ID` | Yes | Okta application client ID | `0oa1a2b3c4d5e6f7g8h9` |
| `OKTA_CLIENT_SECRET` | Yes | Okta application client secret | `secretvalue` |
| `OKTA_REDIRECT_URI` | Yes | OAuth callback URL | `https://yourapp.azurewebsites.net/api/auth-callback` |
| `BASE_URL` | No | Function app base URL | Auto-detected |
| `APIM_SUBSCRIPTION_ID` | No | Azure subscription ID | From deployment context |
| `APIM_RESOURCE_GROUP` | No | APIM resource group | From deployment context |
| `APIM_SERVICE_NAME` | No | APIM service name | From deployment context |

## 📝 Usage Examples

### Complete Authentication Flow

1. **User accesses APIM Developer Portal**
   ```
   User navigates to: https://contoso.developer.azure-api.net/
   ```

2. **APIM redirects to delegation endpoint**
   ```
   GET https://yourapp.azurewebsites.net/api/delegation?operation=SignIn&returnUrl=https%3A%2F%2Fcontoso.developer.azure-api.net%2F&salt=abc123&sig=calculated_signature
   ```

3. **Function app redirects to Okta**
   ```
   302 Redirect to: https://dev-123456.okta.com/oauth2/v1/authorize?client_id=...&response_type=code&scope=openid+profile+email&redirect_uri=...&state=...
   ```

4. **User authenticates with Okta**
   ```
   User enters credentials in Okta login form
   ```

5. **Okta redirects to callback endpoint**
   ```
   GET https://yourapp.azurewebsites.net/api/auth-callback?code=oauth_code&state=encoded_state
   ```

6. **Function app processes callback and redirects to APIM**
   ```
   302 Redirect to: https://contoso.developer.azure-api.net/signin-sso?token=sso_token&returnUrl=...
   ```

### Testing with cURL

#### Health Check
```bash
curl -X GET "https://yourapp.azurewebsites.net/api/health"
```

#### Delegation Endpoint (will fail without valid signature)
```bash
curl -X GET "https://yourapp.azurewebsites.net/api/delegation?operation=SignIn&returnUrl=test&salt=test&sig=invalid"
```

### Integration Testing

#### Node.js Example
```javascript
const axios = require('axios');

async function testHealthEndpoint() {
  try {
    const response = await axios.get('https://yourapp.azurewebsites.net/api/health');
    console.log('Health check:', response.data);
    return response.status === 200;
  } catch (error) {
    console.error('Health check failed:', error.message);
    return false;
  }
}

async function testDelegationEndpoint() {
  try {
    const response = await axios.get('https://yourapp.azurewebsites.net/api/delegation', {
      params: {
        operation: 'SignIn',
        returnUrl: 'test',
        salt: 'test',
        sig: 'invalid'
      },
      validateStatus: () => true // Don't throw on 4xx/5xx
    });
    
    // Should return 401 for invalid signature
    return response.status === 401;
  } catch (error) {
    console.error('Delegation test failed:', error.message);
    return false;
  }
}
```

## 🚨 Error Handling

### Common Error Responses

#### Invalid Signature (401)
```json
{
  "error": "Invalid signature"
}
```

#### Missing Parameters (400)
```json
{
  "error": "Missing code or state parameter"
}
```

#### Expired State (400)
```json
{
  "error": "State parameter expired"
}
```

#### Server Configuration Error (500)
```json
{
  "error": "Server configuration error"
}
```

#### Authentication Failed (500)
```json
{
  "error": "Authentication failed",
  "details": "Token exchange failed: invalid_client"
}
```

### Error Troubleshooting

| Error | Possible Causes | Solutions |
|-------|----------------|-----------|
| Invalid signature | Wrong validation key, incorrect string construction | Verify APIM validation key, check signature algorithm |
| Token exchange failed | Wrong Okta credentials, network issues | Verify Okta client ID/secret, check connectivity |
| Missing APIM configuration | Missing environment variables | Set required APIM configuration variables |
| State parameter expired | Clock skew, slow user interaction | Check system time, increase timeout if needed |

## 📊 Monitoring

### Key Metrics

- **Request Count**: Total requests per endpoint
- **Response Time**: Average response time per endpoint
- **Error Rate**: Percentage of failed requests
- **Authentication Success Rate**: Successful OAuth flows

### Application Insights Queries

#### Request Volume
```kusto
requests
| where timestamp > ago(1h)
| summarize count() by name, bin(timestamp, 5m)
| render timechart
```

#### Error Analysis
```kusto
requests
| where timestamp > ago(24h) and resultCode >= 400
| summarize count() by name, resultCode
| order by count_ desc
```

#### Performance Monitoring
```kusto
requests
| where timestamp > ago(1h)
| summarize avg(duration), percentile(duration, 95) by name
```
