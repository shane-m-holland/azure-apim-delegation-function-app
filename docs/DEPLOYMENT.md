# Deployment Guide

This guide covers how to deploy the APIM delegation function to any environment using the new environment-variable driven approach.

## Quick Start

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env.dev
   ```

2. **Edit your environment file with your values:**
   ```bash
   # .env.dev
   AZURE_SUBSCRIPTION_ID=dev-subscription-123
   AZURE_RESOURCE_GROUP=rg-apim-dev
   APIM_VALIDATION_KEY=dGVzdC12YWxpZGF0aW9uLWtleQ==
   APIM_PORTAL_URL=https://contoso-dev.developer.azure-api.net
   OIDC_ISSUER=https://dev-company.okta.com
   OIDC_CLIENT_ID=0oa1b2c3d4e5f6g7h8i9
   OIDC_CLIENT_SECRET=your-client-secret-here
   ```

3. **Deploy:**
   ```bash
   ./scripts/deploy.sh dev
   ```

## Environment Configuration Examples

### Development Environment
```bash
# .env.dev
AZURE_SUBSCRIPTION_ID=dev-subscription-123
AZURE_RESOURCE_GROUP=rg-apim-dev
APIM_VALIDATION_KEY=dev-validation-key-base64
APIM_PORTAL_URL=https://contoso-dev.developer.azure-api.net
OIDC_ISSUER=https://dev-company.okta.com
OIDC_CLIENT_ID=dev-client-id
OIDC_CLIENT_SECRET=dev-client-secret

# Optional dev-specific settings
APP_NAME=apim-delegation-dev
AZURE_LOCATION=eastus2
AZURE_SKU=Y1  # Consumption plan for cost savings
```

### Production Environment
```bash
# .env.prod
AZURE_SUBSCRIPTION_ID=prod-subscription-456
AZURE_RESOURCE_GROUP=rg-apim-prod
APIM_VALIDATION_KEY=prod-validation-key-base64
APIM_PORTAL_URL=https://contoso.developer.azure-api.net
OIDC_ISSUER=https://company.okta.com
OIDC_CLIENT_ID=prod-client-id
OIDC_CLIENT_SECRET=prod-client-secret

# Optional prod-specific settings
APP_NAME=apim-delegation
AZURE_LOCATION=eastus2
AZURE_SKU=EP1  # Premium plan for guaranteed performance
```

### QA/UAT Environment
```bash
# .env.qa
AZURE_SUBSCRIPTION_ID=qa-subscription-789
AZURE_RESOURCE_GROUP=rg-apim-qa
APIM_VALIDATION_KEY=qa-validation-key-base64
APIM_PORTAL_URL=https://contoso-qa.developer.azure-api.net
OIDC_ISSUER=https://qa-company.okta.com
OIDC_CLIENT_ID=qa-client-id
OIDC_CLIENT_SECRET=qa-client-secret

# Optional qa-specific settings
APP_NAME=apim-delegation-qa
AZURE_LOCATION=centralus
AZURE_SKU=Y1
```

## Multi-Provider Examples

### Azure AD/Entra ID
```bash
OIDC_ISSUER=https://login.microsoftonline.com/your-tenant-id/v2.0
OIDC_CLIENT_ID=your-application-id
OIDC_CLIENT_SECRET=your-client-secret
```

### Google Identity Platform
```bash
OIDC_ISSUER=https://accounts.google.com
OIDC_CLIENT_ID=your-client-id.apps.googleusercontent.com
OIDC_CLIENT_SECRET=your-client-secret
```

### Auth0
```bash
OIDC_ISSUER=https://your-domain.auth0.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
```

## CI/CD Integration

### GitHub Actions Example
```yaml
- name: Deploy to Environment
  run: ./scripts/deploy.sh ${{ github.ref_name }}
  env:
    AZURE_SUBSCRIPTION_ID: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
    AZURE_RESOURCE_GROUP: ${{ secrets.AZURE_RESOURCE_GROUP }}
    APIM_VALIDATION_KEY: ${{ secrets.APIM_VALIDATION_KEY }}
    APIM_PORTAL_URL: ${{ secrets.APIM_PORTAL_URL }}
    OIDC_ISSUER: ${{ secrets.OIDC_ISSUER }}
    OIDC_CLIENT_ID: ${{ secrets.OIDC_CLIENT_ID }}
    OIDC_CLIENT_SECRET: ${{ secrets.OIDC_CLIENT_SECRET }}
```

### Azure DevOps Example
```yaml
- script: ./scripts/deploy.sh $(Build.SourceBranchName)
  displayName: 'Deploy Function App'
  env:
    AZURE_SUBSCRIPTION_ID: $(AZURE_SUBSCRIPTION_ID)
    AZURE_RESOURCE_GROUP: $(AZURE_RESOURCE_GROUP)
    APIM_VALIDATION_KEY: $(APIM_VALIDATION_KEY)
    APIM_PORTAL_URL: $(APIM_PORTAL_URL)
    OIDC_ISSUER: $(OIDC_ISSUER)
    OIDC_CLIENT_ID: $(OIDC_CLIENT_ID)
    OIDC_CLIENT_SECRET: $(OIDC_CLIENT_SECRET)
```

## Available SKUs

| SKU | Description | Best For |
|-----|-------------|----------|
| `Y1` | Consumption plan | Development, low-traffic |
| `EP1` | Premium plan (1 core) | Production, guaranteed performance |
| `EP2` | Premium plan (2 cores) | High-traffic production |
| `EP3` | Premium plan (4 cores) | Very high-traffic production |

## Security Best Practices

1. **Never commit `.env.*` files** - They're git-ignored by default
2. **Use different secrets per environment** - Never share secrets between dev/prod
3. **Rotate secrets regularly** - Especially OIDC client secrets and APIM keys
4. **Use Azure Key Vault in production** - For additional secret protection
5. **Limit access** - Only give deployment credentials to necessary users/services

## Troubleshooting

### Common Issues

**Environment file not found:**
```
Environment file .env.dev not found. Using system environment variables.
```
Solution: Create the environment file or set environment variables directly.

**Missing required variables:**
```
Required environment variable OIDC_ISSUER is not set
```
Solution: Set all required environment variables in your `.env.<environment>` file.

**Invalid SKU:**
```
The parameter sku has an invalid value
```
Solution: Use a valid SKU: `Y1`, `EP1`, `EP2`, or `EP3`.