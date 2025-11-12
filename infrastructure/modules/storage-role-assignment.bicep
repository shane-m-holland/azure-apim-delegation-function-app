@description('The name of the storage account')
param storageAccountName string

@description('The principal ID of the function app managed identity')
param principalId string

@description('The name of the function app (for display purposes)')
param functionAppName string

// Reference to existing storage account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// Storage Blob Data Contributor role definition ID
// This is a well-known Azure built-in role ID
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

// Assign Storage Blob Data Contributor role to the function app's managed identity
resource storageRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, principalId, storageBlobDataContributorRoleId)
  scope: storageAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: principalId
    principalType: 'ServicePrincipal'
    description: 'Grants ${functionAppName} permission to upload deployment packages to storage account'
  }
}

@description('The role assignment ID')
output roleAssignmentId string = storageRoleAssignment.id
