# Troubleshooting Guide

This guide helps diagnose and resolve common issues with the Azure APIM
Authentication Delegation Function App.

## 🚨 Common Issues

### 1. Signature Validation Failures

#### Symptoms

- Users see "Invalid signature" error when trying to sign in
- Logs show "Signature validation failed"
- HTTP 401 responses from delegation endpoint

#### Causes & Solutions

**Incorrect APIM Validation Key**

```bash
# Check current key in Function App
az functionapp config appsettings list --name <function-app> --resource-group <rg> --query "[?name=='APIM_VALIDATION_KEY'].value"

# Get key from APIM (requires management access)
az apim show --name <apim-name> --resource-group <rg> --query "properties.delegationSettings.validationKey"
```

**Base64 Encoding Issues**

```javascript
// Verify key is properly base64 encoded
const key = process.env.APIM_VALIDATION_KEY;
console.log('Key length:', Buffer.from(key, 'base64').length);
// Should be 64 bytes for SHA512
```

**String Construction Mismatch**

```javascript
// Verify string-to-sign construction matches APIM specification
// For SignIn: salt + '\n' + returnUrl
// For other operations: salt + '\n' + userId
```

#### Debug Steps

1. Enable verbose logging in Function App
2. Compare computed vs received signatures
3. Verify APIM delegation configuration
4. Test with known good signature

### 2. OAuth Callback Errors

#### Symptoms

- "Token exchange failed" errors
- Users redirected to error page after Okta authentication
- HTTP 500 responses from auth-callback endpoint

#### Causes & Solutions

**Invalid Okta Configuration**

```bash
# Verify Okta settings
echo "Issuer: $OKTA_ISSUER"
echo "Client ID: $OKTA_CLIENT_ID"
echo "Redirect URI: $OKTA_REDIRECT_URI"

# Test Okta well-known endpoint
curl "$OKTA_ISSUER/.well-known/openid_configuration"
```

**Redirect URI Mismatch**

- Ensure Okta app redirect URI matches Function App URL
- Check for HTTP vs HTTPS mismatches
- Verify domain name accuracy

**Client Secret Issues**

```bash
# Test client credentials
curl -X POST "$OKTA_ISSUER/v1/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=openid&client_id=$OKTA_CLIENT_ID&client_secret=$OKTA_CLIENT_SECRET"
```

#### Debug Steps

1. Check Okta application configuration
2. Verify network connectivity to Okta
3. Test OAuth flow manually
4. Review Okta system logs

### 3. APIM User Creation Failures

#### Symptoms

- "Missing APIM configuration" errors
- Users authenticated but not created in APIM
- APIM Management API errors

#### Causes & Solutions

**Missing APIM Credentials**

```bash
# Check required APIM settings
az functionapp config appsettings list --name <function-app> --resource-group <rg> \
  --query "[?contains(name, 'APIM_')].{name:name, value:value}"
```

**Insufficient Permissions**

- Verify service principal has APIM Contributor role
- Check Azure AD token validity
- Ensure subscription access

**API Version Compatibility**

```javascript
// Verify APIM Management API version
const apiVersion = '2021-08-01'; // Current version used
// Check Azure documentation for latest version
```

#### Debug Steps

1. Test APIM Management API access manually
2. Verify service principal permissions
3. Check Azure AD token expiration
4. Review APIM service health

### 4. Function App Deployment Issues

#### Symptoms

- Deployment failures in GitHub Actions
- Function App not responding
- Configuration errors

#### Causes & Solutions

**Bicep Template Errors**

```bash
# Validate Bicep template
az bicep build --file infrastructure/main.bicep

# Test deployment in what-if mode
az deployment group what-if \
  --resource-group <rg> \
  --template-file infrastructure/main.bicep \
  --parameters infrastructure/parameters/dev.bicepparam
```

**Missing GitHub Secrets** Required secrets in GitHub repository:

- `AZURE_CREDENTIALS`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RG`
- `APIM_VALIDATION_KEY`
- `OKTA_CLIENT_SECRET`

**Function App Cold Start**

```bash
# Warm up function app
curl "https://<function-app>.azurewebsites.net/api/health"
```

#### Debug Steps

1. Check GitHub Actions logs
2. Verify Azure credentials
3. Test Bicep templates locally
4. Review Function App logs

## 🔍 Diagnostic Tools

### 1. Application Insights Queries

#### Authentication Flow Analysis

```kusto
// Track complete authentication flow
traces
| where timestamp > ago(1h)
| where message contains "delegation" or message contains "auth-callback"
| order by timestamp asc
| project timestamp, message, severityLevel
```

#### Error Analysis

```kusto
// Analyze error patterns
exceptions
| where timestamp > ago(24h)
| summarize count() by type, outerMessage
| order by count_ desc
```

#### Performance Monitoring

```kusto
// Function execution times
requests
| where timestamp > ago(1h)
| summarize avg(duration), max(duration), count() by name
| order by avg_duration desc
```

### 2. Health Check Endpoints

#### Function App Health

```bash
# Basic health check
curl "https://<function-app>.azurewebsites.net/api/health"

# Expected response
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Delegation Endpoint Test

```bash
# Test delegation endpoint (should return 401 without valid signature)
curl "https://<function-app>.azurewebsites.net/api/delegation?operation=SignIn&returnUrl=test"

# Expected response: HTTP 401
```

### 3. Log Analysis

#### Enable Debug Logging

```json
// In host.json
{
  "logging": {
    "logLevel": {
      "default": "Debug"
    }
  }
}
```

#### Key Log Messages

- `"Delegation endpoint called"` - Request received
- `"Signature validated successfully"` - HMAC validation passed
- `"Token exchange successful"` - OAuth flow completed
- `"User info retrieved"` - Okta user data obtained

## 🛠️ Recovery Procedures

### 1. Service Outage Recovery

#### Immediate Actions

1. Check Azure service health
2. Verify Function App status
3. Test health endpoints
4. Review recent deployments

#### Rollback Procedure

```bash
# Rollback to previous deployment
az functionapp deployment source config-zip \
  --resource-group <rg> \
  --name <function-app> \
  --src <previous-version.zip>
```

### 2. Configuration Recovery

#### Backup Configuration

```bash
# Export current settings
az functionapp config appsettings list \
  --name <function-app> \
  --resource-group <rg> \
  --output json > backup-settings.json
```

#### Restore Configuration

```bash
# Restore from backup
az functionapp config appsettings set \
  --name <function-app> \
  --resource-group <rg> \
  --settings @backup-settings.json
```

### 3. Secret Rotation Emergency

#### APIM Validation Key

```bash
# Generate new key in APIM
az apim update --name <apim-name> --resource-group <rg> \
  --set properties.delegationSettings.validationKey="<new-key>"

# Update Function App immediately
az functionapp config appsettings set \
  --name <function-app> --resource-group <rg> \
  --settings APIM_VALIDATION_KEY="<new-key>"
```

#### Okta Client Secret

1. Generate new secret in Okta Admin Console
2. Update Function App configuration
3. Test authentication flow
4. Remove old secret

## 📊 Monitoring and Alerting

### 1. Key Metrics to Monitor

#### Availability Metrics

- Function App availability (>99.9%)
- Health endpoint response time (<1s)
- Authentication success rate (>95%)

#### Performance Metrics

- Average response time (<2s)
- Cold start frequency
- Memory usage
- CPU utilization

#### Error Metrics

- HTTP 4xx/5xx error rates
- Exception count
- Failed authentications

### 2. Alert Rules

#### Critical Alerts

```kusto
// High error rate
requests
| where timestamp > ago(5m)
| where resultCode >= 400
| summarize errorRate = count() * 100.0 / count()
| where errorRate > 10
```

#### Warning Alerts

```kusto
// Slow response times
requests
| where timestamp > ago(5m)
| summarize avgDuration = avg(duration)
| where avgDuration > 5000 // 5 seconds
```

### 3. Dashboard Setup

#### Key Visualizations

- Authentication flow success rate
- Response time trends
- Error rate by endpoint
- Geographic distribution of requests

## 📞 Escalation Procedures

### 1. Severity Levels

#### P0 - Critical (Service Down)

- Complete service outage
- Security breach
- Data loss
- **Response Time**: 15 minutes
- **Escalation**: Immediate to on-call engineer

#### P1 - High (Major Impact)

- Partial service degradation
- High error rates (>25%)
- Performance issues
- **Response Time**: 1 hour
- **Escalation**: Within 2 hours if unresolved

#### P2 - Medium (Minor Impact)

- Intermittent issues
- Low error rates (<10%)
- Non-critical feature issues
- **Response Time**: 4 hours
- **Escalation**: Next business day

#### P3 - Low (Minimal Impact)

- Documentation issues
- Enhancement requests
- Minor bugs
- **Response Time**: Next business day
- **Escalation**: Weekly review

## 📋 Troubleshooting Checklist

### Pre-Deployment Checklist

- [ ] All secrets configured correctly
- [ ] Bicep templates validated
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Monitoring configured

### Post-Deployment Checklist

- [ ] Health endpoints responding
- [ ] Authentication flow tested
- [ ] Logs showing expected messages
- [ ] Monitoring alerts configured
- [ ] Performance within acceptable limits

### Incident Response Checklist

- [ ] Issue severity assessed
- [ ] Stakeholders notified
- [ ] Immediate mitigation applied
- [ ] Root cause identified
- [ ] Permanent fix implemented
- [ ] Post-incident review completed
