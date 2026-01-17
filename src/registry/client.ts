/**
 * MCP Registry client for querying the official MCP Registry.
 * @see https://registry.modelcontextprotocol.io/
 */

import type {
  RegistryServersResponse,
  RegistryServerEntry,
  RegistryServer,
  RegistryPackage,
  ListServersOptions,
} from './types.js';
import { getLogger } from '../logging/logger.js';
import { URLS, REGISTRY } from '../constants.js';
import { USER_AGENT } from '../version.js';

const logger = getLogger('registry');

/** Default registry base URL */
export const REGISTRY_BASE_URL = URLS.MCP_REGISTRY;

/** API version */
export const API_VERSION = REGISTRY.API_VERSION;

/**
 * Client for interacting with the MCP Registry API.
 */
export class RegistryClient {
  private baseUrl: string;
  private timeout: number;

  constructor(options?: { baseUrl?: string; timeout?: number }) {
    this.baseUrl = options?.baseUrl ?? REGISTRY_BASE_URL;
    this.timeout = options?.timeout ?? REGISTRY.TIMEOUT;
  }

  /**
   * List servers from the registry.
   */
  async listServers(options?: ListServersOptions): Promise<RegistryServersResponse> {
    const params = new URLSearchParams();

    if (options?.search) {
      params.set('search', options.search);
    }
    if (options?.limit) {
      params.set('limit', String(options.limit));
    }
    if (options?.cursor) {
      params.set('cursor', options.cursor);
    }

    const url = `${this.baseUrl}/${API_VERSION}/servers?${params}`;
    logger.debug({ url }, 'Fetching from registry');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Registry API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as RegistryServersResponse;
      logger.debug({ count: data.metadata.count }, 'Registry response received');

      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Search for servers by name or keyword.
   */
  async searchServers(query: string, limit: number = 10): Promise<RegistryServerEntry[]> {
    const response = await this.listServers({ search: query, limit });
    return response.servers;
  }

  /**
   * Find a server by its exact name.
   */
  async findServer(name: string): Promise<RegistryServerEntry | null> {
    // Try exact match first via search
    const response = await this.listServers({ search: name, limit: 10 });

    // Look for exact name match
    for (const entry of response.servers) {
      if (entry.server.name === name || entry.server.name.endsWith(`/${name}`)) {
        return entry;
      }
    }

    // If not found, try searching for the last part of the name
    const shortName = name.split('/').pop();
    if (shortName && shortName !== name) {
      for (const entry of response.servers) {
        if (entry.server.name.endsWith(`/${shortName}`)) {
          return entry;
        }
      }
    }

    return null;
  }

}

/**
 * Generate a command to run a server based on its registry entry.
 */
export function generateRunCommand(server: RegistryServer): string | null {
  if (!server.packages || server.packages.length === 0) {
    return null;
  }

  // Prefer npm packages, then pip, then others
  const npmPkg = server.packages.find(p => p.registryType === 'npm');
  const pipPkg = server.packages.find(p => p.registryType === 'pip' || p.registryType === 'pypi');
  const pkg = npmPkg ?? pipPkg ?? server.packages[0];

  return generatePackageCommand(pkg);
}

/**
 * Generate a command to run a specific package.
 */
export function generatePackageCommand(pkg: RegistryPackage): string {
  const args = generatePackageArguments(pkg);

  switch (pkg.registryType) {
    case 'npm':
      return `npx ${pkg.identifier}${args}`;

    case 'pip':
    case 'pypi':
      // Python packages can be run with uvx or python -m
      if (pkg.runtime === 'uvx') {
        return `uvx ${pkg.identifier}${args}`;
      }
      return `python -m ${pkg.identifier}${args}`;

    case 'cargo':
      return `cargo run --package ${pkg.identifier}${args}`;

    case 'docker':
      return `docker run ${pkg.identifier}${args}`;

    default:
      return `${pkg.identifier}${args}`;
  }
}

/**
 * Generate argument string for a package.
 */
function generatePackageArguments(pkg: RegistryPackage): string {
  if (!pkg.packageArguments || pkg.packageArguments.length === 0) {
    return '';
  }

  const args: string[] = [];

  for (const arg of pkg.packageArguments) {
    if (arg.isRequired && arg.default !== undefined) {
      // Include required args with defaults as placeholders
      if (arg.type === 'named') {
        args.push(`--${arg.name}=${arg.default}`);
      } else {
        args.push(String(arg.default));
      }
    } else if (arg.isRequired) {
      // Show placeholder for required args without defaults
      if (arg.type === 'named') {
        args.push(`--${arg.name}=<${arg.name}>`);
      } else {
        args.push(`<${arg.name}>`);
      }
    }
  }

  return args.length > 0 ? ' ' + args.join(' ') : '';
}

/**
 * Format a server entry for display.
 */
export function formatServerEntry(entry: RegistryServerEntry): string {
  const { server } = entry;
  const lines: string[] = [];

  lines.push(`${server.name}`);

  if (server.description) {
    lines.push(`  ${server.description}`);
  }

  if (server.version) {
    lines.push(`  Version: ${server.version}`);
  }

  const runCmd = generateRunCommand(server);
  if (runCmd) {
    lines.push(`  Run: ${runCmd}`);
  }

  if (server.packages && server.packages.length > 0) {
    const pkg = server.packages[0];
    if (pkg.transport?.type) {
      lines.push(`  Transport: ${pkg.transport.type}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format multiple server entries for display.
 */
export function formatServerList(entries: RegistryServerEntry[]): string {
  if (entries.length === 0) {
    return 'No servers found.';
  }

  return entries.map(formatServerEntry).join('\n\n');
}
