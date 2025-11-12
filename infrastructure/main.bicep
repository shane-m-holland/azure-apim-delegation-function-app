@description('The name of the function app that you wish to create.')
param appName string

@description('The location into which the resources should be deployed.')
param location string = resourceGroup().location

@description('The language worker runtime to load in the function app.')
@allowed([
  'node'
  'dotnet'
  'java'
])
param runtime string = 'node'

@description('The pricing tier for the hosting plan.')
@allowed([
  'Y1'
  'FC1'
  'EP1'
  'EP2'
  'EP3'
])
param sku string = 'FC1'

@description('Operating system type for the function app.')
@allowed([
  'windows'
  'linux'
])
param osType string = 'linux'

@description('Environment name (e.g. dev, staging, prod)')
param environment string

@description('APIM validation key (base64 encoded)')
@secure()
param apimValidationKey string

@description('APIM portal URL')
param apimPortalUrl string

@description('OIDC provider issuer URL')
param oidcIssuer string

@description('OIDC client ID')
param oidcClientId string

@description('OIDC client secret')
@secure()
param oidcClientSecret string

@description('Optional: Custom OIDC authorization endpoint path')
param oidcAuthorizationEndpoint string = ''

@description('Optional: Custom OIDC token endpoint path')
param oidcTokenEndpoint string = ''

@description('Optional: Custom OIDC userinfo endpoint path')
param oidcUserinfoEndpoint string = ''

@description('APIM subscription ID')
param apimSubscriptionId string = subscription().subscriptionId

@description('APIM resource group name')
param apimResourceGroup string

@description('APIM service name')
param apimServiceName string

@description('Azure access token for APIM Management API (only required for cross-subscription APIM)')
@secure()
param apimAccessToken string = ''

@description('Tags to apply to all resources')
param tags object = {
  Environment: environment
  Application: 'APIM-Delegation'
  ManagedBy: 'Bicep'
}

// SKU and OS compatibility validation
var isY1 = sku == 'Y1'
var isLinux = osType == 'linux'

// Y1 (Classic Consumption) only supports Windows
var isValidConfiguration = isY1 ? !isLinux : true

// Validation - fail deployment if Y1 + Linux is attempted
resource validationDeployment 'Microsoft.Resources/deploymentScripts@2020-10-01' = if (!isValidConfiguration) {
  name: 'validation-failure'
  location: location
  kind: 'AzureCLI'
  properties: {
    azCliVersion: '2.0.80'
    scriptContent: 'echo "Error: Y1 (Classic Consumption) SKU only supports Windows. Use FC1 (Flex Consumption) or Premium (EP1/EP2/EP3) for Linux support."; exit 1'
    retentionInterval: 'PT1H'
  }
}

// Variables
var functionAppName = '${appName}-${environment}'
var hostingPlanName = '${appName}-plan-${environment}'
var applicationInsightsName = '${appName}-ai-${environment}'

// Generate Azure Storage-compliant account name (3-24 chars, lowercase letters and numbers only)
var cleanAppName = replace(toLower(appName), '-', '')
var shortAppName = length(cleanAppName) > 8 ? substring(cleanAppName, 0, 8) : cleanAppName
var shortEnv = length(environment) > 3 ? substring(environment, 0, 3) : environment
var uniqueId = substring(uniqueString(resourceGroup().id), 0, 8)
var storageAccountName = '${shortAppName}${shortEnv}${uniqueId}'

var functionWorkerRuntime = runtime

// Storage Account
module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    storageAccountName: storageAccountName
    location: location
    tags: tags
  }
}

// Application Insights
module appInsights 'modules/app-insights.bicep' = {
  name: 'app-insights-deployment'
  params: {
    applicationInsightsName: applicationInsightsName
    location: location
    tags: tags
  }
}

// App Service Plan (only for Premium plans)
module appServicePlan 'modules/app-service-plan.bicep' = if (sku != 'Y1' && sku != 'FC1') {
  name: 'app-service-plan-deployment'
  params: {
    hostingPlanName: hostingPlanName
    location: location
    sku: sku
    tags: tags
  }
}

// Function App
module functionApp 'modules/function-app.bicep' = {
  name: 'function-app-deployment'
  params: {
    functionAppName: functionAppName
    location: location
    hostingPlanName: (sku == 'Y1') ? '' : hostingPlanName
    sku: sku
    osType: osType
    storageAccountName: storageAccountName
    functionWorkerRuntime: functionWorkerRuntime
    applicationInsightsName: applicationInsightsName
    tags: tags
    appSettings: {
      APIM_VALIDATION_KEY: apimValidationKey
      APIM_PORTAL_URL: apimPortalUrl
      // OIDC configuration
      OIDC_ISSUER: oidcIssuer
      OIDC_CLIENT_ID: oidcClientId
      OIDC_CLIENT_SECRET: oidcClientSecret
      OIDC_REDIRECT_URI: 'https://${functionAppName}.azurewebsites.net/api/auth-callback'
      // Optional custom endpoints
      OIDC_AUTHORIZATION_ENDPOINT: oidcAuthorizationEndpoint
      OIDC_TOKEN_ENDPOINT: oidcTokenEndpoint
      OIDC_USERINFO_ENDPOINT: oidcUserinfoEndpoint
      BASE_URL: 'https://${functionAppName}.azurewebsites.net'
      APIM_SUBSCRIPTION_ID: apimSubscriptionId
      APIM_RESOURCE_GROUP: apimResourceGroup
      APIM_SERVICE_NAME: apimServiceName
      // Only set APIM_ACCESS_TOKEN if provided (for cross-subscription scenarios)
      APIM_ACCESS_TOKEN: apimAccessToken
      // Required for Azure Functions v4 on FC1 plans
      AzureWebJobsFeatureFlags: 'EnableWorkerIndexing'
    }
  }
  dependsOn: [
    storage
    appInsights
    appServicePlan
  ]
}

// Assign Managed Identity permissions to APIM (for same-subscription scenarios)
module apimRoleAssignment 'modules/role-assignment.bicep' = if (apimAccessToken == '' && apimResourceGroup != '' && apimServiceName != '') {
  name: 'apim-role-assignment'
  scope: resourceGroup(apimSubscriptionId, apimResourceGroup)
  params: {
    apimServiceName: apimServiceName
    principalId: functionApp.outputs.principalId
    functionAppName: functionAppName
  }
}

// Outputs
@description('The name of the function app.')
output functionAppName string = functionApp.outputs.functionAppName

@description('The hostname of the function app.')
output functionAppHostName string = functionApp.outputs.functionAppHostName

@description('The resource ID of the function app.')
output functionAppResourceId string = functionApp.outputs.functionAppResourceId

@description('The Application Insights instrumentation key.')
output applicationInsightsInstrumentationKey string = appInsights.outputs.instrumentationKey

@description('The Application Insights connection string.')
output applicationInsightsConnectionString string = appInsights.outputs.connectionString
