/**
 * Cloud integration module for Inquest.
 *
 * Provides functionality for:
 * - Authentication with Inquest Cloud
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
  InquestCloudClient,
  CloudConfig,
  CloudUser,
  Project,
  BaselineVersion,
  UploadResult,
  DiffSummary,
  InquestBaseline,
  BaselineMetadata,
  CloudServerFingerprint,
  ToolCapability,
  ResourceCapability,
  PromptCapability,
  PersonaInterview,
  PersonaFinding,
  CloudToolProfile,
  ProjectLink,
  AuthConfig,
} from './types.js';

export { BASELINE_FORMAT_VERSION } from './types.js';

// Client factory
export { createCloudClient, createCloudClientWithToken } from './client.js';

// Authentication
export {
  getToken,
  setToken,
  clearToken,
  getBaseUrl,
  setBaseUrl,
  clearBaseUrl,
  isAuthenticated,
  isValidTokenFormat,
  isMockToken,
  getLinkedProject,
  saveProjectLink,
  removeProjectLink,
  isLinked,
  CONFIG_DIR,
  AUTH_FILE,
  TOKEN_ENV_VAR,
  BASE_URL_ENV_VAR,
  TOKEN_PREFIX,
  MOCK_TOKEN_PREFIX,
} from './auth.js';

// Mock client utilities (for testing)
export {
  MockCloudClient,
  generateMockToken,
  getMockDataDir,
  clearMockData,
} from './mock-client.js';
