/**
 * MCP Registry integration module.
 * Provides access to the official MCP Registry at registry.modelcontextprotocol.io
 */

export {
  RegistryClient,
  REGISTRY_BASE_URL,
  API_VERSION,
  generateRunCommand,
  generatePackageCommand,
  formatServerEntry,
  formatServerList,
} from './client.js';

export type {
  RegistryRepository,
  RegistryPackageArgument,
  RegistryTransport,
  RegistryPackage,
  RegistryServerMeta,
  RegistryServer,
  RegistryServerEntry,
  RegistryResponseMetadata,
  RegistryServersResponse,
  ListServersOptions,
} from './types.js';
