import {
  parseCommandString,
  type BellwetherConfig,
} from '../../config/loader.js';
import { mergeHeaders, parseCliHeaders } from './headers.js';
import type { TransportType } from '../../transport/base-transport.js';

export interface ResolvedServerRuntime {
  serverCommand: string;
  args: string[];
  transport: TransportType;
  remoteUrl?: string;
  remoteSessionId?: string;
  remoteHeaders?: Record<string, string>;
  serverIdentifier: string;
}

/**
 * Resolve server command, args, transport, and headers from config + CLI inputs.
 */
export function resolveServerRuntime(
  config: BellwetherConfig,
  serverCommandArg: string | undefined,
  serverArgs: string[],
  headerValues?: string[]
): ResolvedServerRuntime {
  const serverConfig = config.server;

  let serverCommand = serverCommandArg || serverConfig.command;
  let args = serverArgs.length > 0 ? serverArgs : serverConfig.args;

  if (!serverCommandArg && args.length === 0 && serverCommand.includes(' ')) {
    const parsed = parseCommandString(serverCommand);
    serverCommand = parsed.command;
    args = parsed.args;
  }

  const transport = (serverConfig.transport ?? 'stdio') as TransportType;
  const remoteUrl = serverConfig.url?.trim();
  const remoteSessionId = serverConfig.sessionId?.trim();
  const cliHeaders = parseCliHeaders(headerValues);
  const remoteHeaders = mergeHeaders(serverConfig.headers, cliHeaders);
  const serverIdentifier =
    transport === 'stdio' ? `${serverCommand} ${args.join(' ')}`.trim() : (remoteUrl ?? 'unknown');

  return {
    serverCommand,
    args,
    transport,
    remoteUrl: remoteUrl || undefined,
    remoteSessionId: remoteSessionId || undefined,
    remoteHeaders,
    serverIdentifier,
  };
}
