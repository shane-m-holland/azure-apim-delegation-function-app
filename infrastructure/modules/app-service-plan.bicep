@description('The name of the App Service Plan')
param hostingPlanName string

@description('The location into which the resources should be deployed.')
param location string = resourceGroup().location

@description('The pricing tier for the hosting plan.')
@allowed([
  'Y1'
  'FC1'
  'EP1'
  'EP2'
  'EP3'
])
param sku string = 'EP1'

@description('Tags to apply to the App Service Plan')
param tags object = {}

resource hostingPlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: hostingPlanName
  location: location
  tags: tags
  sku: {
    name: sku
    tier: (sku == 'Y1' || sku == 'FC1') ? 'Dynamic' : 'ElasticPremium'
  }
  kind: 'elastic'
  properties: {
    maximumElasticWorkerCount: (sku == 'Y1' || sku == 'FC1') ? 1 : 20
    reserved: false
  }
}

@description('The name of the App Service Plan')
output hostingPlanName string = hostingPlan.name

@description('The resource ID of the App Service Plan')
output hostingPlanId string = hostingPlan.id
