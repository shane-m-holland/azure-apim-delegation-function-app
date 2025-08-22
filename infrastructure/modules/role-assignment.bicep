@description('The name of the APIM service to assign permissions to')
param apimServiceName string

@description('The principal ID of the managed identity to assign the role to')
param principalId string

@description('The name of the function app (used for generating unique role assignment name)')
param functionAppName string

// Generate a unique but predictable name for the role assignment
var roleAssignmentName = guid('${subscription().subscriptionId}-${resourceGroup().name}-${apimServiceName}-${functionAppName}', principalId)

// Reference the target APIM service (in the same resource group as this module deployment)
resource apimService 'Microsoft.ApiManagement/service@2021-08-01' existing = {
  name: apimServiceName
}

// Create the role assignment scoped to the APIM service
resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: apimService
  name: roleAssignmentName
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '312a565d-c81f-4fd8-895a-4e21e48d571c') // API Management Service Contributor
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}

@description('The name of the role assignment created')
output roleAssignmentName string = roleAssignment.name

@description('The scope of the role assignment')
output roleAssignmentScope string = apimService.id
