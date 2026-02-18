import { ServerAuthError } from '../../errors/types.js';
import * as output from '../output.js';

interface ErrorHintContext {
  isRemoteTransport: boolean;
  error: unknown;
  errorMessage: string;
}

function isAuthError(context: ErrorHintContext): boolean {
  const { error, errorMessage } = context;
  return (
    error instanceof ServerAuthError ||
    errorMessage.includes('401') ||
    errorMessage.includes('403') ||
    errorMessage.includes('407') ||
    /unauthorized|forbidden|authentication|authorization/i.test(errorMessage)
  );
}

function isConnectionRefused(context: ErrorHintContext): boolean {
  const { errorMessage } = context;
  return errorMessage.includes('ECONNREFUSED') || errorMessage.includes('Connection refused');
}

function isRemoteNotFound(context: ErrorHintContext): boolean {
  return context.isRemoteTransport && context.errorMessage.includes('HTTP 404');
}

function isTimeoutError(context: ErrorHintContext): boolean {
  const { errorMessage } = context;
  return errorMessage.includes('timeout') || errorMessage.includes('Timeout');
}

function isCommandNotFound(context: ErrorHintContext): boolean {
  const { errorMessage, isRemoteTransport } = context;
  return (
    !isRemoteTransport && (errorMessage.includes('ENOENT') || errorMessage.includes('not found'))
  );
}

function isApiKeyError(context: ErrorHintContext): boolean {
  const { errorMessage } = context;
  return errorMessage.includes('API key') || errorMessage.includes('authentication');
}

/**
 * Shared check-command transport/auth remediation hints.
 */
export function printCheckErrorHints(error: unknown, transport: string): void {
  const context: ErrorHintContext = {
    error,
    isRemoteTransport: transport !== 'stdio',
    errorMessage: error instanceof Error ? error.message : String(error),
  };

  if (isAuthError(context)) {
    output.error('\nAuthentication failed:');
    output.error('  - Add server.headers.Authorization in bellwether.yaml');
    output.error('  - Or pass --header "Authorization: Bearer $TOKEN"');
    output.error('  - Verify credentials are valid and not expired');
    return;
  }

  if (isConnectionRefused(context)) {
    output.error('\nPossible causes:');
    if (context.isRemoteTransport) {
      output.error('  - The remote MCP server is not reachable');
      output.error('  - The server URL/port is incorrect');
    } else {
      output.error('  - The MCP server is not running');
      output.error('  - The server address/port is incorrect');
    }
    return;
  }

  if (isRemoteNotFound(context)) {
    output.error('\nPossible causes:');
    output.error('  - The remote MCP URL is incorrect');
    output.error('  - For SSE transport, verify the server exposes /sse');
    return;
  }

  if (isTimeoutError(context)) {
    output.error('\nPossible causes:');
    output.error('  - The MCP server is taking too long to respond');
    output.error('  - Increase server.timeout in bellwether.yaml');
    return;
  }

  if (isCommandNotFound(context)) {
    output.error('\nPossible causes:');
    output.error('  - The server command was not found');
    output.error('  - Check that the command is installed and in PATH');
  }
}

/**
 * Shared explore-command transport/auth remediation hints.
 */
export function printExploreErrorHints(error: unknown, transport: string): void {
  const context: ErrorHintContext = {
    error,
    isRemoteTransport: transport !== 'stdio',
    errorMessage: error instanceof Error ? error.message : String(error),
  };

  if (isAuthError(context)) {
    output.error('\nPossible causes:');
    output.error('  - Missing or invalid remote MCP authentication headers');
    output.error('  - Add server.headers.Authorization or pass --header "Authorization: Bearer $TOKEN"');
    output.error('  - Verify token scopes/permissions');
    return;
  }

  if (isConnectionRefused(context)) {
    output.error('\nPossible causes:');
    if (context.isRemoteTransport) {
      output.error('  - The remote MCP server is not reachable');
      output.error('  - The server URL/port is incorrect');
    } else {
      output.error('  - The MCP server is not running');
      output.error('  - The server address/port is incorrect');
    }
    return;
  }

  if (isRemoteNotFound(context)) {
    output.error('\nPossible causes:');
    output.error('  - The remote MCP URL is incorrect');
    output.error('  - For SSE transport, verify the server exposes /sse');
    return;
  }

  if (isTimeoutError(context)) {
    output.error('\nPossible causes:');
    output.error('  - The MCP server is taking too long to respond');
    output.error('  - Increase server.timeout in bellwether.yaml');
    return;
  }

  if (isCommandNotFound(context)) {
    output.error('\nPossible causes:');
    output.error('  - The server command was not found');
    output.error('  - Check that the command is installed and in PATH');
    return;
  }

  if (isApiKeyError(context)) {
    output.error('\nPossible causes:');
    output.error('  - Missing or invalid API key');
    output.error('  - Run "bellwether auth" to configure API keys');
  }
}
