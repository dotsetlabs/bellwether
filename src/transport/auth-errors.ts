import { ServerAuthError } from '../errors/types.js';

interface AuthErrorConfig {
  unauthorizedMessage: string;
  forbiddenMessage: string;
  proxyMessage?: string;
  unauthorizedHint?: string;
  forbiddenHint?: string;
  proxyHint?: string;
}

const DEFAULT_HINTS = {
  unauthorized:
    'Add server.headers.Authorization (for example: Bearer token) in bellwether.yaml or pass --header.',
  forbidden: 'Credentials are recognized but lack required permissions. Verify token scopes/roles.',
  proxy: 'Configure proxy credentials and retry.',
} as const;

/**
 * Map HTTP auth-related status codes to typed transport auth errors.
 */
export function createServerAuthError(
  status: number,
  config: AuthErrorConfig
): ServerAuthError | null {
  if (status === 401) {
    return new ServerAuthError(
      config.unauthorizedMessage,
      401,
      config.unauthorizedHint ?? DEFAULT_HINTS.unauthorized
    );
  }
  if (status === 403) {
    return new ServerAuthError(
      config.forbiddenMessage,
      403,
      config.forbiddenHint ?? DEFAULT_HINTS.forbidden
    );
  }
  if (status === 407) {
    return new ServerAuthError(
      config.proxyMessage ?? 'Proxy authentication required (407)',
      407,
      config.proxyHint ?? DEFAULT_HINTS.proxy
    );
  }

  return null;
}
