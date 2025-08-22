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

## 🚀 GitHub Actions Automated Deployment

This repository includes a complete GitHub Actions workflow for automated deployment with the following features:

- **3-stage deployment pipeline**: Build/Test → Infrastructure → Application → Smoke Tests
- **Environment-based deployment**: `main` branch → `prod`, `develop` branch → `dev`
- **Federated authentication**: Secure OIDC-based login (no stored passwords)
- **Infrastructure as Code**: Automatic Azure resource provisioning
- **Health validation**: Post-deployment smoke tests

### Prerequisites

#### 1. Azure Service Principal with Federated Credentials

**Step 1: Create App Registration**
```bash
az ad app create --display-name "github-actions-apim-delegation"
```

**Step 2: Create Service Principal**
```bash
# Get the app ID from step 1
APP_ID=$(az ad app list --display-name "github-actions-apim-delegation" --query "[].appId" -o tsv)

# Create service principal
az ad sp create --id $APP_ID

# Assign Contributor role to your resource group
az role assignment create \
  --assignee $APP_ID \
  --role "Contributor" \
  --scope "/subscriptions/your-subscription-id/resourceGroups/your-resource-group"
```

**Step 3: Configure Federated Credentials**
```bash
# For main branch (production)
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-main",
    "issuer": "https://token.actions.githubusercontent.com", 
    "subject": "repo:your-username/your-repo-name:ref:refs/heads/main",
    "description": "GitHub Actions Main Branch",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# For develop branch (development)  
az ad app federated-credential create \
  --id $APP_ID \
  --parameters '{
    "name": "github-actions-develop",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:your-username/your-repo-name:ref:refs/heads/develop", 
    "description": "GitHub Actions Develop Branch",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

#### 2. Cross-Subscription APIM Permissions (If Needed)

If your APIM instance is in a different subscription:
```bash
# Grant permissions to APIM resource
az role assignment create \
  --assignee $APP_ID \
  --role "API Management Service Contributor" \
  --scope "/subscriptions/apim-subscription-id/resourceGroups/apim-resource-group/providers/Microsoft.ApiManagement/service/apim-service-name"
```

### GitHub Configuration

#### Required Secrets

Navigate to **Settings** → **Secrets and variables** → **Actions** in your GitHub repository:

**Authentication Secrets:**
- `AZURE_CLIENT_ID`: App ID from service principal creation
- `AZURE_TENANT_ID`: Your Azure tenant ID (`az account show --query tenantId -o tsv`)
- `AZURE_SUBSCRIPTION_ID`: Your Azure subscription ID
- `AZURE_RESOURCE_GROUP`: Resource group for Function App deployment

**APIM Configuration Secrets:**
- `APIM_VALIDATION_KEY`: Base64-encoded APIM validation key
- `APIM_PORTAL_URL`: APIM Developer Portal URL (e.g., `https://contoso.developer.azure-api.net`)

**OIDC Provider Secrets:**
- `OIDC_ISSUER`: Identity provider URL (e.g., `https://your-domain.okta.com`)
- `OIDC_CLIENT_ID`: OAuth client ID
- `OIDC_CLIENT_SECRET`: OAuth client secret

**Optional Secrets (for cross-subscription scenarios):**
- `APIM_ACCESS_TOKEN`: Azure Bearer token for cross-subscription APIM access

#### Optional Variables

Navigate to **Settings** → **Secrets and variables** → **Actions** → **Variables**:

**Deployment Configuration:**
- `APP_NAME`: Application name (default: `apim-delegation`)
- `AZURE_LOCATION`: Azure region (default: `eastus2`)
- `AZURE_SKU`: Function App SKU (default: `FC1`)
- `AZURE_OS_TYPE`: OS type (default: `linux`)
- `RUNTIME`: Function runtime (default: `node`)

**APIM Configuration (same-subscription scenarios):**
- `APIM_RESOURCE_GROUP`: APIM resource group name
- `APIM_SERVICE_NAME`: APIM service name

**Custom OIDC Endpoints (if auto-discovery fails):**
- `OIDC_AUTHORIZATION_ENDPOINT`: Custom auth endpoint path
- `OIDC_TOKEN_ENDPOINT`: Custom token endpoint path  
- `OIDC_USERINFO_ENDPOINT`: Custom userinfo endpoint path
- `OIDC_END_SESSION_ENDPOINT`: Custom logout endpoint path

### Deployment Workflow

The workflow automatically triggers on:
- **Push to `main`**: Deploys to production environment
- **Push to `develop`**: Deploys to development environment  
- **Pull requests**: Runs build and tests only (no deployment)

#### Workflow Stages

**1. Build & Test**
- Install Node.js dependencies
- Run ESLint code linting
- Execute Jest test suite
- Build application (if needed)

**2. Deploy Infrastructure**
- Deploy Azure resources using Bicep templates
- Configure Function App with environment variables
- Set up managed identity and role assignments
- Output deployment details

**3. Deploy Application**
- Create deployment ZIP package
- Deploy function code to Azure
- Clean up temporary files

**4. Smoke Tests**  
- Test health endpoint (`/api/health`)
- Verify delegation endpoint security (`/api/delegation`)
- Output deployment summary

### Environment Strategy

| Branch | Environment | Function App Name | Description |
|--------|-------------|-------------------|-------------|
| `main` | `prod` | `apim-delegation-prod` | Production deployment |
| `develop` | `dev` | `apim-delegation-dev` | Development deployment |

### GitHub Actions Troubleshooting

#### Authentication Issues

**Problem: "Login failed with Error: ClientAuthenticationError"**
```
Run azure/login@v2
Error: Login failed with Error: ClientAuthenticationError
```

**Solutions:**
1. Verify `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID` secrets are set correctly
2. Ensure federated credential subject matches your repository path exactly:
   ```
   repo:your-username/your-repo-name:ref:refs/heads/main
   ```
3. Check that the service principal has `Contributor` role on the resource group

**Problem: "Insufficient privileges to complete the operation"**
```
Error: The client does not have authorization to perform action 'Microsoft.Authorization/roleAssignments/write'
```

**Solutions:**
1. Grant additional permission for role assignments:
   ```bash
   az role assignment create \
     --assignee $APP_ID \
     --role "User Access Administrator" \
     --scope "/subscriptions/your-subscription-id/resourceGroups/your-resource-group"
   ```

#### Infrastructure Deployment Issues

**Problem: "Parameter file not found"**
```
Error: The parameter file './infrastructure/parameters/dev.bicepparam' does not exist
```

**Solution:** The workflow has been updated to use direct parameters instead of parameter files. Ensure you're using the latest workflow version.

**Problem: "Missing required parameter"**
```
Error: The parameter 'apimValidationKey' is required but not provided
```

**Solution:** Verify all required secrets are configured in GitHub:
- `APIM_VALIDATION_KEY`
- `APIM_PORTAL_URL`  
- `OIDC_ISSUER`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`

#### Application Deployment Issues

**Problem: "Function app not found"**
```
Error: The Resource 'Microsoft.Web/sites/apim-delegation-dev' under resource group 'your-rg' was not found
```

**Solution:** Ensure the infrastructure deployment completed successfully before application deployment.

### Manual Deployment (Local Script)

If you prefer manual deployment or need to troubleshoot:

```bash
# Clone and configure
git clone <your-repo-url>
cd apim-delegation-func
cp .env.example .env.dev

# Edit .env.dev with your settings
# Then deploy
./scripts/deploy.sh dev
```

### Other CI/CD Platforms

#### Azure DevOps Example

```yaml
trigger:
  branches:
    include:
    - main
    - develop

pool:
  vmImage: 'ubuntu-latest'

variables:
  nodeVersion: '22.x'

stages:
- stage: Deploy
  jobs:
  - job: DeployFunction
    steps:
    - task: NodeTool@0
      inputs:
        versionSpec: '$(nodeVersion)'
    
    - script: npm ci
      displayName: 'Install dependencies'
    
    - script: npm run validate  
      displayName: 'Run validation'
    
    - task: AzureCLI@2
      displayName: 'Deploy to Azure'
      inputs:
        azureSubscription: 'your-service-connection'
        scriptType: 'bash'
        scriptLocation: 'inlineScript'
        inlineScript: |
          ./scripts/deploy.sh $(Build.SourceBranchName)
      env:
        AZURE_SUBSCRIPTION_ID: $(AZURE_SUBSCRIPTION_ID)
        AZURE_RESOURCE_GROUP: $(AZURE_RESOURCE_GROUP)
        APIM_VALIDATION_KEY: $(APIM_VALIDATION_KEY)
        APIM_PORTAL_URL: $(APIM_PORTAL_URL)
        OIDC_ISSUER: $(OIDC_ISSUER)
        OIDC_CLIENT_ID: $(OIDC_CLIENT_ID)
        OIDC_CLIENT_SECRET: $(OIDC_CLIENT_SECRET)
        APIM_RESOURCE_GROUP: $(APIM_RESOURCE_GROUP)
        APIM_SERVICE_NAME: $(APIM_SERVICE_NAME)
        APIM_ACCESS_TOKEN: $(APIM_ACCESS_TOKEN)
```

#### GitLab CI Example

```yaml
stages:
  - build
  - deploy

variables:
  NODE_VERSION: "22"

build:
  stage: build
  image: node:$NODE_VERSION
  script:
    - npm ci
    - npm run validate
  artifacts:
    paths:
      - node_modules/

deploy:
  stage: deploy
  image: mcr.microsoft.com/azure-cli:latest
  before_script:
    - az login --service-principal -u $AZURE_CLIENT_ID -p $AZURE_CLIENT_SECRET --tenant $AZURE_TENANT_ID
  script:
    - ./scripts/deploy.sh $CI_COMMIT_REF_NAME
  only:
    - main
    - develop
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