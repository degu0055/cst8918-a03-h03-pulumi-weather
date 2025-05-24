import * as pulumi from '@pulumi/pulumi';
import * as resources from '@pulumi/azure-native/resources';
import * as containerregistry from '@pulumi/azure-native/containerregistry';
import * as dockerBuild from '@pulumi/docker-build';
import * as containerinstance from '@pulumi/azure-native/containerinstance';
import * as redis from '@pulumi/azure-native/redis';

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

// Create a managed Redis service
const redisResource = new redis.Redis(`${prefixName}-redis`, {
    name: `${prefixName}-weather-cache`,
    location: resourceGroup.location,
    resourceGroupName: resourceGroup.name,
    enableNonSslPort: true,
    redisVersion: '6',
    minimumTlsVersion: '1.2',
    redisConfiguration: {
        maxmemoryPolicy: 'allkeys-lru',
    },
    sku: {
        name: 'Basic',
        family: 'C',
        capacity: 0,
    },
});

// Extract the Redis access key (primaryKey)
const redisAccessKey = redis
    .listRedisKeysOutput({
        name: redisResource.name,
        resourceGroupName: resourceGroup.name,
    })
    .apply(keys => keys.primaryKey);

// Construct the Redis connection string
const redisConnectionString = pulumi.interpolate`rediss://:${redisAccessKey}@${redisResource.hostName}:${redisResource.sslPort}`;

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

// Build and push the Docker image
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
                        value: config.requireSecret('weatherApiKey'),
                    },
                    {
                        name: 'REDIS_URL',
                        value: redisConnectionString,
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
