/**
 * Mock cloud client for LOCAL DEVELOPMENT AND TESTING ONLY.
 *
 * ⚠️  WARNING: This is NOT a production implementation!
 *
 * This mock client:
 * - Stores data locally in ~/.bellwether/mock-cloud/ as JSON files
 * - Simulates cloud API responses for development purposes
 * - Does NOT sync data to any remote server
 * - Should ONLY be used with mock sessions (sess_mock_*)
 *
 * For production use, connect to the real Bellwether Cloud API.
 *
 * Usage:
 *   bellwether login --mock   # Creates a mock session for development
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes } from 'crypto';
import type {
  BellwetherCloudClient,
  CloudUser,
  Project,
  BaselineVersion,
  UploadResult,
  DiffSummary,
  BellwetherBaseline,
  StoredSession,
  BadgeInfo,
} from './types.js';
import { isMockSession, MOCK_SESSION_PREFIX } from './auth.js';
import * as output from '../cli/output.js';

/**
 * Directory for mock cloud storage.
 */
const MOCK_DATA_DIR = join(homedir(), '.bellwether', 'mock-cloud');

/**
 * File for storing projects.
 */
const PROJECTS_FILE = 'projects.json';

/**
 * Generate a unique ID using cryptographically secure random bytes.
 * Format: {prefix}_{timestamp}_{random}
 * Example: proj_1a2b3c4d_e5f6a7b8
 */
function generateId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Mock cloud client implementation for development and testing.
 *
 * ⚠️  DEVELOPMENT ONLY - NOT FOR PRODUCTION USE!
 *
 * This client:
 * - Stores all data locally in ~/.bellwether/mock-cloud/
 * - Provides a full implementation of the BellwetherCloudClient interface
 * - Does NOT communicate with any remote servers
 * - Should only be used with mock sessions (generated via `bellwether login --mock`)
 *
 * Features that work differently in mock mode:
 * - Badge URLs point to shields.io for display purposes only
 * - Project URLs are local file:// paths
 * - No data synchronization across machines
 *
 * For production deployments, use the real CloudClient with proper authentication.
 */
export class MockCloudClient implements BellwetherCloudClient {
  private dataDir: string;
  private sessionToken: string | null;

  /**
   * Create a new MockCloudClient.
   *
   * @param sessionToken - A mock session token (must start with 'sess_mock_')
   */
  constructor(sessionToken?: string) {
    this.dataDir = MOCK_DATA_DIR;
    this.sessionToken = sessionToken ?? null;
    this.ensureDataDir();

    // Log warning if used with non-mock session
    if (sessionToken && !isMockSession(sessionToken)) {
      output.warn('Warning: MockCloudClient instantiated with non-mock session token.');
      output.warn('This client stores data locally and does not sync to the cloud.');
    }
  }

  /**
   * Ensure the mock data directory exists.
   */
  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  /**
   * Get path to projects file.
   */
  private get projectsFile(): string {
    return join(this.dataDir, PROJECTS_FILE);
  }

  /**
   * Get path to baselines file for a project.
   */
  private getBaselinesFile(projectId: string): string {
    return join(this.dataDir, `${projectId}-baselines.json`);
  }

  /**
   * Get path to a specific baseline data file.
   */
  private getBaselineDataFile(baselineId: string): string {
    return join(this.dataDir, `${baselineId}.json`);
  }

  /**
   * Load projects from storage.
   */
  private loadProjects(): Project[] {
    if (!existsSync(this.projectsFile)) {
      return [];
    }

    try {
      const content = readFileSync(this.projectsFile, 'utf-8');
      return JSON.parse(content) as Project[];
    } catch {
      return [];
    }
  }

  /**
   * Save projects to storage.
   */
  private saveProjects(projects: Project[]): void {
    writeFileSync(this.projectsFile, JSON.stringify(projects, null, 2));
  }

  /**
   * Load baselines for a project.
   */
  private loadBaselines(projectId: string): BaselineVersion[] {
    const file = this.getBaselinesFile(projectId);

    if (!existsSync(file)) {
      return [];
    }

    try {
      const content = readFileSync(file, 'utf-8');
      return JSON.parse(content) as BaselineVersion[];
    } catch {
      return [];
    }
  }

  /**
   * Save baselines for a project.
   */
  private saveBaselines(projectId: string, baselines: BaselineVersion[]): void {
    const file = this.getBaselinesFile(projectId);
    writeFileSync(file, JSON.stringify(baselines, null, 2));
  }

  // ============================================================================
  // BellwetherCloudClient Implementation
  // ============================================================================

  isAuthenticated(): boolean {
    if (!this.sessionToken) {
      return false;
    }

    // For mock client, accept any mock session
    return isMockSession(this.sessionToken);
  }

  async whoami(): Promise<CloudUser | null> {
    if (!this.isAuthenticated()) {
      return null;
    }

    // Extract "user" from mock session for display
    // Session format: sess_mock_<user>_<random>
    const session = this.sessionToken ?? '';
    const parts = session.split('_');
    const user = parts.length >= 3 ? parts[2] : 'developer';

    return {
      id: 'usr_mock_' + user,
      email: `${user}@localhost`,
      githubLogin: user,
      githubAvatarUrl: null,
      githubName: user,
      plan: 'free',
    };
  }

  async listProjects(): Promise<Project[]> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    return this.loadProjects();
  }

  async createProject(name: string, serverCommand: string): Promise<Project> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const projects = this.loadProjects();

    const project: Project = {
      id: generateId('proj'),
      name,
      serverCommand,
      createdAt: new Date().toISOString(),
      isPublic: false,
      baselineCount: 0,
    };

    projects.push(project);
    this.saveProjects(projects);

    return project;
  }

  async getProject(projectId: string): Promise<Project | null> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const projects = this.loadProjects();
    return projects.find((p) => p.id === projectId) ?? null;
  }

  async deleteProject(projectId: string): Promise<void> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const projects = this.loadProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Remove project
    projects.splice(index, 1);
    this.saveProjects(projects);

    // Clean up baselines
    const baselinesFile = this.getBaselinesFile(projectId);
    if (existsSync(baselinesFile)) {
      // Delete baseline data files first
      const baselines = this.loadBaselines(projectId);
      for (const baseline of baselines) {
        const dataFile = this.getBaselineDataFile(baseline.id);
        if (existsSync(dataFile)) {
          unlinkSync(dataFile);
        }
      }
      unlinkSync(baselinesFile);
    }
  }

  async uploadBaseline(
    projectId: string,
    baseline: BellwetherBaseline
  ): Promise<UploadResult> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Verify project exists
    const projects = this.loadProjects();
    const projectIndex = projects.findIndex((p) => p.id === projectId);

    if (projectIndex === -1) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // Load existing baselines
    const baselines = this.loadBaselines(projectId);
    const version = baselines.length + 1;
    const baselineId = generateId('bl');

    // Create baseline version record
    const baselineVersion: BaselineVersion = {
      id: baselineId,
      projectId,
      version,
      uploadedAt: new Date().toISOString(),
      cliVersion: baseline.metadata.cliVersion,
      hash: baseline.hash,
      // BaselineMetadata has specific typed fields, but BaselineVersion.metadata
      // is a generic Record<string, unknown> for flexibility. Double cast required.
      metadata: baseline.metadata as unknown as Record<string, unknown>,
    };

    // Save baseline version record
    baselines.push(baselineVersion);
    this.saveBaselines(projectId, baselines);

    // Save full baseline data
    const dataFile = this.getBaselineDataFile(baselineId);
    writeFileSync(dataFile, JSON.stringify(baseline, null, 2));

    // Update project
    const project = projects[projectIndex];
    project.baselineCount = version;
    project.lastUploadAt = new Date().toISOString();
    this.saveProjects(projects);

    // Build result
    const viewUrl = `file://${dataFile}`;
    const diffUrl = version > 1 ? `mock://diff/${projectId}/${version - 1}/${version}` : undefined;

    return {
      baselineId,
      version,
      projectId,
      viewUrl,
      diffUrl,
    };
  }

  async getHistory(projectId: string, limit: number = 10): Promise<BaselineVersion[]> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Verify project exists
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const baselines = this.loadBaselines(projectId);

    // Return most recent first, limited
    return baselines.slice(-limit).reverse();
  }

  async getBaseline(baselineId: string): Promise<BellwetherBaseline | null> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const dataFile = this.getBaselineDataFile(baselineId);

    if (!existsSync(dataFile)) {
      return null;
    }

    try {
      const content = readFileSync(dataFile, 'utf-8');
      return JSON.parse(content) as BellwetherBaseline;
    } catch {
      return null;
    }
  }

  async getDiff(
    projectId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<DiffSummary> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    // Load baselines
    const baselines = this.loadBaselines(projectId);

    const fromBaseline = baselines.find((b) => b.version === fromVersion);
    const toBaseline = baselines.find((b) => b.version === toVersion);

    if (!fromBaseline || !toBaseline) {
      throw new Error(`Baseline version not found: ${fromVersion} or ${toVersion}`);
    }

    // Load full baseline data
    const fromData = await this.getBaseline(fromBaseline.id);
    const toData = await this.getBaseline(toBaseline.id);

    if (!fromData || !toData) {
      throw new Error('Failed to load baseline data');
    }

    // Compute diff
    return this.computeDiff(fromData, toData);
  }

  async getLatestDiff(projectId: string): Promise<DiffSummary | null> {
    if (!this.isAuthenticated()) {
      throw new Error('Not authenticated');
    }

    const baselines = this.loadBaselines(projectId);

    if (baselines.length < 2) {
      return null;
    }

    // Get last two versions
    const toVersion = baselines[baselines.length - 1].version;
    const fromVersion = baselines[baselines.length - 2].version;

    return this.getDiff(projectId, fromVersion, toVersion);
  }

  async getBadgeInfo(projectId: string): Promise<BadgeInfo | null> {
    // Note: Badge info is public and doesn't require authentication
    const project = this.loadProjects().find((p) => p.id === projectId);

    if (!project) {
      return null;
    }

    const baselines = this.loadBaselines(projectId);
    const latestBaseline = baselines.length > 0 ? baselines[baselines.length - 1] : null;

    // Determine status based on latest diff
    let status: BadgeInfo['status'] = 'unknown';
    let statusText = 'Not verified';

    if (baselines.length === 0) {
      status = 'unknown';
      statusText = 'No baseline';
    } else if (baselines.length === 1) {
      status = 'passing';
      statusText = 'Verified';
    } else {
      // Check drift between last two versions
      const diff = await this.getLatestDiff(projectId);
      if (diff) {
        if (diff.severity === 'none' || diff.severity === 'info') {
          status = 'passing';
          statusText = 'Stable';
        } else if (diff.severity === 'warning') {
          status = 'drift';
          statusText = 'Drift detected';
        } else {
          status = 'failing';
          statusText = 'Breaking changes';
        }
      } else {
        status = 'passing';
        statusText = 'Verified';
      }
    }

    // Badge URL - using shields.io format for mock
    const color = status === 'passing' ? 'brightgreen' : status === 'drift' ? 'yellow' : status === 'failing' ? 'red' : 'lightgrey';
    const badgeUrl = `https://img.shields.io/badge/bellwether-${encodeURIComponent(statusText)}-${color}`;

    // Generate markdown
    const projectUrl = `https://bellwether.sh/projects/${projectId}`;
    const markdown = `[![Bellwether](${badgeUrl})](${projectUrl})`;

    return {
      projectId,
      projectName: project.name,
      status,
      statusText,
      badgeUrl,
      markdown,
      lastVerified: latestBaseline?.uploadedAt,
      latestVersion: latestBaseline?.version,
    };
  }

  // ============================================================================
  // Diff Computation
  // ============================================================================

  /**
   * Compute diff between two baselines.
   */
  private computeDiff(from: BellwetherBaseline, to: BellwetherBaseline): DiffSummary {
    // Quick check - if hashes match, no changes
    if (from.hash === to.hash) {
      return {
        severity: 'none',
        toolsAdded: 0,
        toolsRemoved: 0,
        toolsModified: 0,
        behaviorChanges: 0,
      };
    }

    // Get tool names
    const fromTools = new Set(from.capabilities.tools.map((t) => t.name));
    const toTools = new Set(to.capabilities.tools.map((t) => t.name));

    // Count additions and removals
    const toolsAdded = [...toTools].filter((t) => !fromTools.has(t)).length;
    const toolsRemoved = [...fromTools].filter((t) => !toTools.has(t)).length;

    // Count modifications (tools in both with different schema hash)
    let toolsModified = 0;
    const fromToolMap = new Map(from.capabilities.tools.map((t) => [t.name, t]));
    const toToolMap = new Map(to.capabilities.tools.map((t) => [t.name, t]));

    for (const [name, fromTool] of fromToolMap) {
      const toTool = toToolMap.get(name);
      if (toTool && fromTool.schemaHash !== toTool.schemaHash) {
        toolsModified++;
      }
    }

    // Count behavior changes from assertions
    const fromAssertions = new Set(from.assertions.map((a) => `${a.tool}:${a.condition}`));
    const toAssertions = new Set(to.assertions.map((a) => `${a.tool}:${a.condition}`));

    let behaviorChanges = 0;
    for (const a of toAssertions) {
      if (!fromAssertions.has(a)) {
        behaviorChanges++;
      }
    }
    for (const a of fromAssertions) {
      if (!toAssertions.has(a)) {
        behaviorChanges++;
      }
    }

    // Determine severity
    let severity: DiffSummary['severity'] = 'none';

    if (toolsRemoved > 0) {
      severity = 'breaking';
    } else if (toolsModified > 0 || behaviorChanges > 5) {
      severity = 'warning';
    } else if (toolsAdded > 0 || behaviorChanges > 0) {
      severity = 'info';
    }

    return {
      severity,
      toolsAdded,
      toolsRemoved,
      toolsModified,
      behaviorChanges,
    };
  }
}

/**
 * Generate a mock session for development.
 */
export function generateMockSession(username: string = 'dev'): StoredSession {
  const random = randomBytes(16).toString('hex');
  const sessionToken = `${MOCK_SESSION_PREFIX}${username}_${random}`;

  return {
    sessionToken,
    user: {
      id: `usr_mock_${username}`,
      email: `${username}@localhost`,
      githubLogin: username,
      githubAvatarUrl: null,
      githubName: username,
      plan: 'free',
    },
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  };
}

/**
 * Get the mock data directory path.
 */
export function getMockDataDir(): string {
  return MOCK_DATA_DIR;
}

/**
 * Clear all mock data (for testing).
 */
export function clearMockData(): void {
  if (!existsSync(MOCK_DATA_DIR)) {
    return;
  }

  const files = readdirSync(MOCK_DATA_DIR);
  for (const file of files) {
    unlinkSync(join(MOCK_DATA_DIR, file));
  }
}
