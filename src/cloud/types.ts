/**
 * Cloud integration types for Bellwether SaaS platform.
 *
 * This module defines types for:
 * - Cloud API communication
 * - BellwetherBaseline format (cloud-ready)
 * - Project and baseline management
 * - Authentication
 *
 * Baseline versioning uses CLI package version:
 * - Same CLI major version = compatible baselines
 * - Different CLI major version = requires migration
 */

import type { WorkflowSignature } from '../baseline/types.js';
import type {
  ResponseFingerprint,
  InferredSchema,
  ErrorPattern,
} from '../baseline/response-fingerprint.js';

/**
 * Assertion type for cloud API.
 * Maps to: expects (positive), requires (critical), warns (negative), notes (informational)
 */
export type CloudAssertionType = 'expects' | 'requires' | 'warns' | 'notes';

/**
 * Severity level for cloud assertions.
 */
export type CloudAssertionSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Behavioral assertion in cloud format.
 * This is the format expected by the Bellwether Cloud API.
 */
export interface CloudAssertion {
  /** Type of assertion */
  type: CloudAssertionType;
  /** The condition/assertion statement */
  condition: string;
  /** Tool this assertion relates to (optional) */
  tool?: string;
  /** Severity level (optional) */
  severity?: CloudAssertionSeverity;
}

/**
 * Baseline mode indicating how the baseline was generated.
 * - 'check': Deterministic structural testing (no LLM required)
 * - 'explore': LLM-powered behavioral exploration
 */
export type BaselineMode = 'check' | 'explore';

/**
 * Metadata about how the baseline was generated.
 */
export interface BaselineMetadata {
  /** Baseline mode: 'check' = deterministic, 'explore' = LLM-powered */
  mode: BaselineMode;
  /** ISO timestamp when generated */
  generatedAt: string;
  /** CLI version that generated this baseline */
  cliVersion: string;
  /** Command used to start the server */
  serverCommand: string;
  /** Server name from MCP initialization */
  serverName?: string;
  /** Interview duration in milliseconds */
  durationMs: number;
  /** Personas used during interview (empty for check mode) */
  personas: string[];
  /** LLM model used ('none' for check mode) */
  model: string;
}

/**
 * Server fingerprint in cloud baseline format.
 */
export interface CloudServerFingerprint {
  /** Server name */
  name: string;
  /** Server version */
  version: string;
  /** MCP protocol version */
  protocolVersion: string;
  /** Available capabilities */
  capabilities: string[];
}

/**
 * Tool capability from discovery.
 */
export interface ToolCapability {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Input schema */
  inputSchema: Record<string, unknown>;
  /** Hash of the schema for change detection */
  schemaHash: string;
  // Response fingerprinting (check mode enhancement)
  /** Fingerprint of the tool's response structure */
  responseFingerprint?: ResponseFingerprint;
  /** Inferred JSON schema of the tool's output */
  inferredOutputSchema?: InferredSchema;
  /** Normalized error patterns observed during testing */
  errorPatterns?: ErrorPattern[];
}

/**
 * Resource capability from discovery.
 */
export interface ResourceCapability {
  /** Resource URI template */
  uri: string;
  /** Resource name */
  name: string;
  /** Resource description */
  description?: string;
  /** MIME type */
  mimeType?: string;
}

/**
 * Prompt capability from discovery.
 */
export interface PromptCapability {
  /** Prompt name */
  name: string;
  /** Prompt description */
  description?: string;
  /** Arguments the prompt accepts */
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

/**
 * Interview results for a single persona.
 */
export interface PersonaInterview {
  /** Persona ID */
  persona: string;
  /** Number of tools interviewed */
  toolsInterviewed: number;
  /** Number of questions asked */
  questionsAsked: number;
  /** Findings from this persona */
  findings: PersonaFinding[];
}

/**
 * A finding from a persona interview.
 */
export interface PersonaFinding {
  /** Tool this finding relates to */
  tool: string;
  /** Finding category */
  category: 'behavior' | 'security' | 'reliability' | 'edge_case';
  /** Severity level */
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  /** Description of the finding */
  description: string;
  /** Evidence supporting the finding */
  evidence?: string;
}

/**
 * Tool behavioral profile in cloud format.
 */
export interface CloudToolProfile {
  /** Tool name */
  name: string;
  /** Tool description */
  description: string;
  /** Hash of input schema */
  schemaHash: string;
  /** Behavioral assertions in cloud format */
  assertions: CloudAssertion[];
  /** Security notes */
  securityNotes: string[];
  /** Known limitations */
  limitations: string[];
  /** Behavioral notes */
  behavioralNotes: string[];
}

/**
 * Cloud-ready baseline format.
 *
 * This is the format used for uploading to Bellwether Cloud.
 * It's a superset of the local BehavioralBaseline with additional metadata.
 *
 * Versioning: Uses CLI package version for compatibility checking.
 * Baselines with the same CLI major version are compatible.
 */
export interface BellwetherBaseline {
  /** CLI version that generated this baseline (e.g., '0.6.0') */
  version: string;

  /** Generation metadata */
  metadata: BaselineMetadata;

  /** Server fingerprint */
  server: CloudServerFingerprint;

  /** Discovered capabilities */
  capabilities: {
    tools: ToolCapability[];
    resources?: ResourceCapability[];
    prompts?: PromptCapability[];
  };

  /** Interview results by persona */
  interviews: PersonaInterview[];

  /** Tool behavioral profiles */
  toolProfiles: CloudToolProfile[];

  /** Workflow results (if workflows were tested) */
  workflows?: WorkflowSignature[];

  /** Overall behavioral assertions in cloud format */
  assertions: CloudAssertion[];

  /** Summary of findings */
  summary: string;

  /** SHA-256 hash of content (first 16 chars) for integrity */
  hash: string;
}
/**
 * Configuration for the cloud client.
 */
export interface CloudConfig {
  /** API base URL */
  baseUrl: string;
  /** Session token */
  sessionToken?: string;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * A project in Bellwether Cloud.
 */
export interface Project {
  /** Unique project ID */
  id: string;
  /** Project name */
  name: string;
  /** Server command used to start the MCP server */
  serverCommand: string;
  /** ISO timestamp when created */
  createdAt: string;
  /** Whether baselines are publicly viewable */
  isPublic: boolean;
  /** Number of baselines uploaded */
  baselineCount: number;
  /** ISO timestamp of last upload */
  lastUploadAt?: string;
}

/**
 * A baseline version stored in Bellwether Cloud.
 */
export interface BaselineVersion {
  /** Unique baseline ID */
  id: string;
  /** Project this baseline belongs to */
  projectId: string;
  /** Version number (auto-incrementing per project) */
  version: number;
  /** Baseline mode: 'check' or 'explore' */
  mode: BaselineMode;
  /** ISO timestamp when uploaded */
  uploadedAt: string;
  /** CLI version that generated this baseline */
  cliVersion: string;
  /** Hash of the baseline content */
  hash: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result of uploading a baseline.
 */
export interface UploadResult {
  /** ID of the uploaded baseline */
  baselineId: string;
  /** Version number assigned */
  version: number;
  /** Project ID */
  projectId: string;
  /** URL to view the diff (if not first upload) */
  diffUrl?: string;
  /** URL to view the baseline */
  viewUrl: string;
}

/**
 * Summary of differences between two baselines.
 */
export interface DiffSummary {
  /** Overall severity of changes */
  severity: 'none' | 'info' | 'warning' | 'breaking';
  /** Number of tools added */
  toolsAdded: number;
  /** Number of tools removed */
  toolsRemoved: number;
  /** Number of tools with modifications */
  toolsModified: number;
  /** Number of behavior changes detected */
  behaviorChanges: number;
}

/**
 * User information from the cloud.
 */
export interface CloudUser {
  /** User ID */
  id: string;
  /** User email */
  email: string | null;
  /** GitHub username */
  githubLogin: string;
  /** GitHub avatar URL */
  githubAvatarUrl: string | null;
  /** GitHub display name */
  githubName: string | null;
  /** Subscription plan */
  plan: 'free' | 'pro';
}

/**
 * Link configuration stored in .bellwether/link.json
 */
export interface ProjectLink {
  /** Linked project ID */
  projectId: string;
  /** Project name (for display) */
  projectName: string;
  /** ISO timestamp when linked */
  linkedAt: string;
  /** Team ID this project belongs to */
  teamId?: string;
  /** Team name (for display) */
  teamName?: string;
}

/**
 * Team information stored in session.
 */
export interface SessionTeam {
  /** Team ID */
  id: string;
  /** Team name */
  name: string;
  /** Team plan */
  plan: 'free' | 'solo' | 'team';
  /** User's role in this team */
  role: 'owner' | 'admin' | 'member';
}

/**
 * Session stored in ~/.bellwether/session.json
 */
export interface StoredSession {
  /** Session token */
  sessionToken: string;
  /** User information */
  user: CloudUser;
  /** ISO timestamp when session expires */
  expiresAt: string;
  /** Currently active team ID for API requests */
  activeTeamId?: string;
  /** All teams the user belongs to */
  teams?: SessionTeam[];
  /** ISO timestamp when the session token was last rotated */
  tokenRotatedAt?: string;
}

/**
 * Device authorization response from device flow.
 */
export interface DeviceAuthorizationResponse {
  /** Device code for polling */
  device_code: string;
  /** User code to display */
  user_code: string;
  /** URL for user to visit */
  verification_uri: string;
  /** Time until expiration in seconds */
  expires_in: number;
  /** Polling interval in seconds */
  interval: number;
}

/**
 * Device poll response.
 */
export interface DevicePollResponse {
  /** Error code if not yet authorized */
  error?: 'authorization_pending' | 'expired_token' | 'access_denied';
  /** Error description */
  error_description?: string;
  /** Session token if authorized */
  session_token?: string;
  /** User info if authorized */
  user?: CloudUser;
}

/**
 * Response from /auth/me endpoint.
 */
export interface AuthMeResponse {
  /** User information */
  user: CloudUser;
  /** Teams the user belongs to */
  teams: SessionTeam[];
  /** Whether user has beta access (optional) */
  hasBetaAccess?: boolean;
  /** Whether user is an admin (optional) */
  isAdmin?: boolean;
}

/**
 * Badge status for a project.
 * Matches platform badge service status values.
 */
export type BadgeStatus = 'verified' | 'failing' | 'drift' | 'unknown';

/**
 * Verification status for a project.
 * Matches platform verification service status values.
 */
export type VerificationStatus =
  | 'verified'
  | 'pending'
  | 'failed'
  | 'expired'
  | 'not_verified';

/**
 * Verification tier based on test coverage.
 */
export type VerificationTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/**
 * Verification result from a verification run.
 * This matches the format expected by the platform API.
 */
export interface CloudVerificationResult {
  /** Server identifier (namespace/name) */
  serverId: string;
  /** Server version */
  version: string;
  /** Verification status */
  status: VerificationStatus;
  /** Verification tier achieved */
  tier?: VerificationTier | null;
  /** ISO timestamp when verified */
  verifiedAt: string;
  /** ISO timestamp when verification expires */
  expiresAt: string;
  /** Number of tools verified */
  toolsVerified: number;
  /** Number of tests passed */
  testsPassed: number;
  /** Total number of tests run */
  testsTotal: number;
  /** Pass rate (0-100) */
  passRate: number;
  /** Checksum of the verification report */
  reportHash: string;
  /** Bellwether version used */
  bellwetherVersion: string;
}

/**
 * Result of submitting a verification to the platform.
 */
export interface VerificationSubmissionResult {
  /** Verification ID assigned by the platform */
  verificationId: string;
  /** Project ID the verification was submitted to */
  projectId: string;
  /** URL to view the verification in the dashboard */
  viewUrl: string;
}

/**
 * Badge information for a project.
 */
export interface BadgeInfo {
  /** Project ID */
  projectId: string;
  /** Project name */
  projectName: string;
  /** Current badge status */
  status: BadgeStatus;
  /** Human-readable status text */
  statusText: string;
  /** Badge URL (SVG) */
  badgeUrl: string;
  /** Badge markdown for README */
  markdown: string;
  /** Last verification date */
  lastVerified?: string;
  /** Latest version number */
  latestVersion?: number;
}
/**
 * Interface for Bellwether Cloud client implementations.
 *
 * This interface is implemented by:
 * - MockCloudClient (local development/testing)
 * - HttpCloudClient (production)
 */
export interface BellwetherCloudClient {
  /** Check if client is authenticated */
  isAuthenticated(): boolean;

  /** Get current user info */
  whoami(): Promise<CloudUser | null>;

  /** List user's projects */
  listProjects(): Promise<Project[]>;

  /** Create a new project */
  createProject(name: string, serverCommand: string): Promise<Project>;

  /** Get project by ID */
  getProject(projectId: string): Promise<Project | null>;

  /** Delete a project */
  deleteProject(projectId: string): Promise<void>;

  /** Upload a baseline to a project */
  uploadBaseline(
    projectId: string,
    baseline: BellwetherBaseline
  ): Promise<UploadResult>;

  /** Get baseline history for a project */
  getHistory(projectId: string, limit?: number): Promise<BaselineVersion[]>;

  /** Get a specific baseline by ID */
  getBaseline(baselineId: string): Promise<BellwetherBaseline | null>;

  /** Get diff between two versions */
  getDiff(
    projectId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<DiffSummary>;

  /** Get latest diff (current vs previous) */
  getLatestDiff(projectId: string): Promise<DiffSummary | null>;

  /** Get badge info for a project */
  getBadgeInfo(projectId: string): Promise<BadgeInfo | null>;

  /** Submit a verification result to a project */
  submitVerification(
    projectId: string,
    result: CloudVerificationResult,
    report?: Record<string, unknown>
  ): Promise<VerificationSubmissionResult>;
}
