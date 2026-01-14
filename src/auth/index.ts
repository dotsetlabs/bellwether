/**
 * Authentication module - secure credential management.
 */

export {
  KeychainService,
  getKeychainService,
  type KeychainBackend,
} from './keychain.js';

export {
  resolveCredentials,
  resolveApiKeySync,
  hasCredentials,
  describeCredentialSource,
  getAuthStatus,
  DEFAULT_ENV_VARS,
  type CredentialResult,
  type AuthStatus,
} from './credentials.js';
