/**
 * MCP Registry API types.
 * Based on the official MCP Registry at registry.modelcontextprotocol.io
 */

/**
 * Repository information for a server.
 */
export interface RegistryRepository {
  /** Repository URL (e.g., GitHub URL) */
  url: string;
  /** Source type (e.g., "github") */
  source: string;
  /** Subfolder within the repository, if applicable */
  subfolder?: string;
}

/**
 * Package argument definition.
 */
export interface RegistryPackageArgument {
  /** Argument name */
  name: string;
  /** Description of the argument */
  description?: string;
  /** Argument type ("named" or "positional") */
  type: 'named' | 'positional';
  /** Value format */
  format?: 'string' | 'number' | 'boolean';
  /** Whether the argument is required */
  isRequired?: boolean;
  /** Default value */
  default?: string | number | boolean;
}

/**
 * Transport configuration for a package.
 */
export interface RegistryTransport {
  /** Transport type */
  type: 'stdio' | 'sse' | 'streamable-http';
  /** URL for remote transports */
  url?: string;
}

/**
 * Package distribution information.
 */
export interface RegistryPackage {
  /** Package registry type (npm, pip, cargo, etc.) */
  registryType: string;
  /** Base URL of the registry */
  registryBaseUrl?: string;
  /** Package identifier/name */
  identifier: string;
  /** Package version */
  version?: string;
  /** Transport configuration */
  transport?: RegistryTransport;
  /** Package arguments */
  packageArguments?: RegistryPackageArgument[];
  /** Runtime (e.g., "node", "python") */
  runtime?: string;
}

/**
 * Server metadata from the registry.
 */
export interface RegistryServerMeta {
  /** Server status (e.g., "active") */
  status?: string;
  /** When the server was published */
  publishedAt?: string;
  /** When the server was last updated */
  updatedAt?: string;
  /** Whether this is the latest version */
  isLatest?: boolean;
}

/**
 * Server definition from the registry.
 */
export interface RegistryServer {
  /** JSON Schema reference */
  $schema?: string;
  /** Server name (namespace/name format) */
  name: string;
  /** Short description */
  description?: string;
  /** Repository information */
  repository?: RegistryRepository;
  /** Server version */
  version?: string;
  /** Available packages/distributions */
  packages?: RegistryPackage[];
  /** Icon URL */
  iconUrl?: string;
  /** Homepage URL */
  homepage?: string;
  /** License */
  license?: string;
  /** Keywords/tags */
  keywords?: string[];
}

/**
 * Server entry in registry response.
 */
export interface RegistryServerEntry {
  /** Server definition */
  server: RegistryServer;
  /** Registry metadata */
  _meta?: {
    'io.modelcontextprotocol.registry/official'?: RegistryServerMeta;
    [key: string]: RegistryServerMeta | undefined;
  };
}

/**
 * Response metadata.
 */
export interface RegistryResponseMetadata {
  /** Total count of results */
  count: number;
  /** Cursor for pagination */
  nextCursor?: string;
}

/**
 * Response from the servers list endpoint.
 */
export interface RegistryServersResponse {
  /** List of servers */
  servers: RegistryServerEntry[];
  /** Response metadata */
  metadata: RegistryResponseMetadata;
}

/**
 * Options for listing servers.
 */
export interface ListServersOptions {
  /** Search query */
  search?: string;
  /** Maximum number of results */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}
