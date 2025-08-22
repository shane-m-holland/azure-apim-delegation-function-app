@description('The name of the function app that you wish to create.')
param functionAppName string

@description('The location into which the resources should be deployed.')
param location string = resourceGroup().location

@description('The name of the App Service plan to use. Empty for consumption plan.')
param hostingPlanName string = ''

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

@description('The name of the storage account')
param storageAccountName string

@description('The language worker runtime to load in the function app.')
param functionWorkerRuntime string = 'node'

@description('The name of the Application Insights component')
param applicationInsightsName string

@description('Application settings for the function app')
param appSettings object = {}

@description('Tags to apply to the function app')
param tags object = {}

// Reference existing resources
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: applicationInsightsName
}

resource hostingPlan 'Microsoft.Web/serverfarms@2022-09-01' existing = if (sku != 'Y1' && sku != 'FC1') {
  name: hostingPlanName
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
    serverFarmId: (sku == 'Y1' || sku == 'FC1') ? null : hostingPlan.id
    reserved: osType == 'linux' ? true : false
    siteConfig: union({
      appSettings: union([
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
      ], appSettingsArray)
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
      }
      use32BitWorkerProcess: false
      ftpsState: 'FtpsOnly'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      functionAppScaleLimit: (sku == 'Y1' || sku == 'FC1') ? 200 : 0
      minimumElasticInstanceCount: (sku == 'Y1' || sku == 'FC1') ? 0 : 1
    }, osType == 'linux' && sku != 'Y1' ? { linuxFxVersion: 'Node|22' } : {})
    httpsOnly: true
    clientAffinityEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

// Function App Configuration (needed for Linux Node.js version setting)
resource functionAppConfig 'Microsoft.Web/sites/config@2022-09-01' = if (sku != 'Y1') {
  parent: functionApp
  name: 'web'
  properties: {
    numberOfWorkers: 1
    linuxFxVersion: osType == 'linux' ? 'Node|22' : null
    defaultDocuments: [
      'Default.htm'
      'Default.html'
      'index.html'
    ]
    requestTracingEnabled: false
    remoteDebuggingEnabled: false
    httpLoggingEnabled: false
    acrUseManagedIdentityCreds: false
    logsDirectorySizeLimit: 35
    detailedErrorLoggingEnabled: false
    publishingUsername: '$${functionAppName}'
    scmType: 'None'
    use32BitWorkerProcess: false
    webSocketsEnabled: false
    alwaysOn: sku != 'Y1' && sku != 'FC1'
    managedPipelineMode: 'Integrated'
    virtualApplications: [
      {
        virtualPath: '/'
        physicalPath: 'site\\wwwroot'
        preloadEnabled: sku != 'Y1' && sku != 'FC1'
      }
    ]
    loadBalancing: 'LeastRequests'
    experiments: {
      rampUpRules: []
    }
    autoHealEnabled: false
    vnetRouteAllEnabled: false
    vnetPrivatePortsCount: 0
    localMySqlEnabled: false
    ipSecurityRestrictions: [
      {
        ipAddress: 'Any'
        action: 'Allow'
        priority: 2147483647
        name: 'Allow all'
        description: 'Allow all access'
      }
    ]
    scmIpSecurityRestrictions: [
      {
        ipAddress: 'Any'
        action: 'Allow'
        priority: 2147483647
        name: 'Allow all'
        description: 'Allow all access'
      }
    ]
    scmIpSecurityRestrictionsUseMain: false
    http20Enabled: true
    minTlsVersion: '1.2'
    scmMinTlsVersion: '1.2'
    ftpsState: 'FtpsOnly'
    preWarmedInstanceCount: (sku == 'Y1' || sku == 'FC1') ? 0 : 1
    functionAppScaleLimit: (sku == 'Y1' || sku == 'FC1') ? 200 : 0
    functionsRuntimeScaleMonitoringEnabled: sku != 'Y1' && sku != 'FC1'
    minimumElasticInstanceCount: (sku == 'Y1' || sku == 'FC1') ? 0 : 1
    azureStorageAccounts: {}
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
