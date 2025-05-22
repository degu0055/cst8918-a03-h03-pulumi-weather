import * as pulumi from '@pulumi/pulumi'
import * as resources from '@pulumi/azure-native/resources'
import * as containerregistry from '@pulumi/azure-native/containerregistry'

// Load configuration values from Pulumi config
const config = new pulumi.Config()
const appPath = config.require('appPath')
const prefixName = config.require('prefixName')
const imageName = prefixName
const imageTag = config.require('imageTag')
const containerPort = config.requireNumber('containerPort')
const publicPort = config.requireNumber('publicPort')
const cpu = config.requireNumber('cpu')
const memory = config.requireNumber('memory')

// Create an Azure Resource Group
const resourceGroup = new resources.ResourceGroup(`${prefixName}-rg`)

// Create an Azure Container Registry (ACR)
const registry = new containerregistry.Registry(`${prefixName}ACR`, {
  resourceGroupName: resourceGroup.name,
  adminUserEnabled: true,
  sku: {
    name: containerregistry.SkuName.Basic,
  },
})

// Fetch ACR credentials (username and password)
const registryCredentials = containerregistry
  .listRegistryCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
  })
  .apply((creds) => ({
    username: creds.username!,
    password: creds.passwords![0].value!,
  }))

// Export values for debugging or next steps
export const acrServer = registry.loginServer
export const acrUsername = registryCredentials.username
