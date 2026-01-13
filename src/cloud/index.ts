/**
 * Cloud integration module for Bellwether.
 *
 * Provides functionality for:
 * - Authentication with Bellwether Cloud
 * - Project and baseline management
 * - Uploading and comparing baselines
 *
 * @example
 * ```typescript
 * import { createCloudClient, getToken, isAuthenticated } from './cloud/index.js';
 *
 * if (isAuthenticated()) {
 *   const client = createCloudClient();
 *   const projects = await client.listProjects();
 * }
 * ```
 */

// Types
export type {
  BellwetherCloudClient,
  CloudConfig,
  CloudUser,
  Project,
  BaselineVersion,
  UploadResult,
  DiffSummary,
  BellwetherBaseline,
  BaselineMetadata,
  CloudServerFingerprint,
  ToolCapability,
  ResourceCapability,
  PromptCapability,
  PersonaInterview,
  PersonaFinding,
  CloudToolProfile,
  ProjectLink,
  StoredSession,
} from './types.js';

export { BASELINE_FORMAT_VERSION } from './types.js';

// Client factory
export { createCloudClient, createCloudClientWithSession } from './client.js';

// Authentication
export {
  getSessionToken,
  getStoredSession,
  saveSession,
  clearSession,
  getBaseUrl,
  isAuthenticated,
  isValidSessionFormat,
  isMockSession,
  getLinkedProject,
  saveProjectLink,
  removeProjectLink,
  isLinked,
  CONFIG_DIR,
  SESSION_FILE,
  SESSION_ENV_VAR,
  BASE_URL_ENV_VAR,
  SESSION_PREFIX,
  MOCK_SESSION_PREFIX,
} from './auth.js';

// Mock client utilities (for testing)
export {
  MockCloudClient,
  generateMockSession,
  getMockDataDir,
  clearMockData,
} from './mock-client.js';
