@description('The name of the function app that you wish to create.')
param functionAppName string

@description('The location into which the resources should be deployed.')
param location string = resourceGroup().location

@description('The name of the App Service plan. Required for FC1 and EPx. Ignored when sku = "Y1".')
param hostingPlanName string

@description('The pricing tier for the hosting plan.')
@allowed([
  'Y1'   // Classic Consumption
  'FC1'  // Flex Consumption
  'EP1'  // Elastic Premium
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

@description('The name of the storage account')
param storageAccountName string

@description('The language worker runtime to load in the function app.')
param functionWorkerRuntime string = 'node'

@description('The name of the Application Insights component')
param applicationInsightsName string

@description('Application settings for the function app (additional to the defaults).')
param appSettings object = {}

@description('Tags to apply to the function app')
param tags object = {}

// Existing resources
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

// App Service plan for any non-Y1 SKU (FC1 or EPx)
resource hostingPlan 'Microsoft.Web/serverfarms@2024-04-01' = if (sku != 'Y1') {
  name: hostingPlanName
  location: location
  kind: sku == 'FC1' ? 'functionapp' : 'elastic'
  sku: sku == 'FC1'
    ? {
        name: 'FC1'
        tier: 'FlexConsumption'
      }
    : {
        name: sku         // EP1 / EP2 / EP3
        tier: 'ElasticPremium'
        family: 'EP'
      }
  properties: {
    reserved: osType == 'linux'
  }
}

// Convert appSettings object to array format
var appSettingsArray = [for setting in items(appSettings): {
  name: setting.key
  value: setting.value
}]

// Function App
resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: osType == 'linux' ? 'functionapp,linux' : 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // Y1: let Azure create/attach the dynamic plan
    // FC1/EPx: attach to explicit plan
    serverFarmId: sku == 'Y1' ? null : hostingPlan.id
    reserved: osType == 'linux'
    siteConfig: {
      appSettings: concat(
        [
          {
            name: 'AzureWebJobsStorage'
            value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
          }
          {
            name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
            value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
          }
          {
            name: 'WEBSITE_CONTENTSHARE'
            value: toLower(functionAppName)
          }
          {
            name: 'FUNCTIONS_EXTENSION_VERSION'
            value: '~4'
          }
          {
            name: 'FUNCTIONS_WORKER_RUNTIME'
            value: functionWorkerRuntime
          }
          {
            name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
            value: applicationInsights.properties.InstrumentationKey
          }
          {
            name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
            value: applicationInsights.properties.ConnectionString
          }
        ],
        appSettingsArray
      )
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
      }
      ftpsState: 'FtpsOnly'
      http20Enabled: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      use32BitWorkerProcess: false
    }
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

@description('The name of the function app.')
output functionAppName string = functionApp.name

@description('The hostname of the function app.')
output functionAppHostName string = functionApp.properties.defaultHostName

@description('The resource ID of the function app.')
output functionAppResourceId string = functionApp.id

@description('The principal ID of the system assigned identity.')
output principalId string = functionApp.identity.principalId
