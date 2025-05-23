import * as pulumi from '@pulumi/pulumi';
import * as resources from '@pulumi/azure-native/resources';
import * as containerregistry from '@pulumi/azure-native/containerregistry';
import * as dockerBuild from '@pulumi/docker-build';
import * as containerinstance from '@pulumi/azure-native/containerinstance';

// Load configuration values from Pulumi config
const config = new pulumi.Config();
const appPath = config.require('appPath');
const prefixName = config.require('prefixName');
const imageName = prefixName;
const imageTag = config.require('imageTag');
const containerPort = config.requireNumber('containerPort');
const publicPort = config.requireNumber('publicPort');
const cpu = config.requireNumber('cpu');
const memory = config.requireNumber('memory');

// Create an Azure Resource Group
const resourceGroup = new resources.ResourceGroup(`${prefixName}-rg`);

// Create an Azure Container Registry (ACR)
const registry = new containerregistry.Registry(`${prefixName}ACR`, {
  resourceGroupName: resourceGroup.name,
  adminUserEnabled: true,
  sku: {
    name: containerregistry.SkuName.Basic,
  },
});

// Fetch ACR credentials (username and password)
const registryCredentials = containerregistry
  .listRegistryCredentialsOutput({
    resourceGroupName: resourceGroup.name,
    registryName: registry.name,
  })
  .apply(creds => ({
    username: creds.username!,
    password: creds.passwords![0].value!,
  }));

// Export ACR info
export const acrServer = registry.loginServer;
export const acrUsername = registryCredentials.username;

// Build and push the Docker image (note: **no** 'target' property here)
const image = new dockerBuild.Image(`${prefixName}-image`, {
  tags: [pulumi.interpolate`${registry.loginServer}/${imageName}:${imageTag}`],
  context: { location: appPath },
  dockerfile: { location: `${appPath}/Dockerfile` },
  platforms: ['linux/amd64', 'linux/arm64'],
  push: true,
  registries: [
    {
      address: registry.loginServer,
      username: registryCredentials.username,
      password: registryCredentials.password,
    },
  ],
});

// Create the container group in Azure Container Instances (ACI)
const containerGroup = new containerinstance.ContainerGroup(
  `${prefixName}-container-group`,
  {
    resourceGroupName: resourceGroup.name,
    osType: 'Linux',
    restartPolicy: 'Always',
    imageRegistryCredentials: [
      {
        server: registry.loginServer,
        username: registryCredentials.username,
        password: registryCredentials.password,
      },
    ],
    containers: [
      {
        name: imageName,
        image: image.ref,
        ports: [
          {
            port: containerPort,
            protocol: 'TCP',
          },
        ],
        environmentVariables: [
          {
            name: 'PORT',
            value: containerPort.toString(),
          },
          {
            name: 'WEATHER_API_KEY',
            value: '9f9c2512ac2f9f4b14a00a21fd0a0831', // Replace with your actual secret or use Pulumi secrets
          },
        ],
        resources: {
          requests: {
            cpu: cpu,
            memoryInGB: memory,
          },
        },
      },
    ],
    ipAddress: {
      type: containerinstance.ContainerGroupIpAddressType.Public,
      dnsNameLabel: imageName,
      ports: [
        {
          port: publicPort,
          protocol: 'TCP',
        },
      ],
    },
  }
);

// Export outputs
export const hostname = containerGroup.ipAddress.apply(addr => addr!.fqdn!);
export const ip = containerGroup.ipAddress.apply(addr => addr!.ip!);
export const url = containerGroup.ipAddress.apply(addr => `http://${addr!.fqdn!}:${containerPort}`);
