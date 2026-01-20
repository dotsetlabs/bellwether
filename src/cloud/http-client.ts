/**
 * HTTP cloud client for production API.
 *
 * Makes real HTTP requests to the Bellwether Cloud API.
 * Handles automatic session token rotation when the server returns
 * a new token via the X-Rotated-Session-Token header.
 */

import type {
  BellwetherCloudClient,
  CloudUser,
  Project,
  BaselineVersion,
  UploadResult,
  DiffSummary,
  BellwetherBaseline,
  BadgeInfo,
} from './types.js';
import { updateSessionToken } from './auth.js';

/**
 * Header name for receiving rotated session token from server.
 */
const ROTATED_TOKEN_HEADER = 'x-rotated-session-token';

/**
 * API error response.
 */
interface ApiError {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Validate that a URL uses HTTPS in production.
 * Allows HTTP only for localhost/127.0.0.1 for local development.
 */
function validateSecureUrl(url: string): void {
  const parsed = new URL(url);

  // Allow HTTP for local development
  const isLocalhost =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';

  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error(
      `Insecure URL rejected: ${url}. ` +
        'Cloud API must use HTTPS for security. ' +
        'HTTP is only allowed for localhost.'
    );
  }
}

/**
 * HTTP cloud client implementation.
 */
export class HttpCloudClient implements BellwetherCloudClient {
  private baseUrl: string;
  private sessionToken: string;
  private teamId?: string;
  private timeout: number;

  constructor(baseUrl: string, sessionToken: string, timeout: number = 30000, teamId?: string) {
    // Validate HTTPS requirement
    validateSecureUrl(baseUrl);

    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.sessionToken = sessionToken;
    this.teamId = teamId;
    this.timeout = timeout;
  }

  /**
   * Make an authenticated request.
   * Handles automatic session token rotation when the server returns
   * a new token via the X-Rotated-Session-Token header.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    // Build headers, including X-Team-Id if available
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.sessionToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.teamId) {
      headers['X-Team-Id'] = this.teamId;
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check for rotated session token
      const rotatedToken = response.headers.get(ROTATED_TOKEN_HEADER);
      if (rotatedToken) {
        // Update stored session with new token (non-blocking)
        updateSessionToken(rotatedToken).catch(() => {
          // Silently ignore errors - rotation is best-effort
          // The old token will still work during grace period
        });
        // Update this client's token for subsequent requests
        this.sessionToken = rotatedToken;
      }

      if (!response.ok) {
        let errorData: ApiError;
        try {
          errorData = await response.json() as ApiError;
        } catch {
          errorData = {
            error: 'unknown',
            message: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
        throw new Error(errorData.message);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  // ============================================================================
  // BellwetherCloudClient Implementation
  // ============================================================================

  isAuthenticated(): boolean {
    return !!this.sessionToken;
  }

  async whoami(): Promise<CloudUser | null> {
    if (!this.sessionToken) {
      return null;
    }

    try {
      const response = await this.request<{ user: CloudUser }>('GET', '/auth/me');
      return response.user;
    } catch {
      return null;
    }
  }

  async listProjects(): Promise<Project[]> {
    const response = await this.request<{ projects: Project[] }>('GET', '/projects');
    return response.projects;
  }

  async createProject(name: string, serverCommand: string): Promise<Project> {
    const response = await this.request<{ project: Project }>('POST', '/projects', {
      name,
      serverCommand,
    });
    return response.project;
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      const response = await this.request<{ project: Project }>(
        'GET',
        `/projects/${projectId}`
      );
      return response.project;
    } catch {
      return null;
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.request<{ success: boolean }>('DELETE', `/projects/${projectId}`);
  }

  async uploadBaseline(
    projectId: string,
    baseline: BellwetherBaseline
  ): Promise<UploadResult> {
    const response = await this.request<{
      baseline: BaselineVersion;
      diff: DiffSummary | null;
    }>('POST', `/projects/${projectId}/baselines`, baseline);

    return {
      baselineId: response.baseline.id,
      version: response.baseline.version,
      projectId,
      viewUrl: `${this.baseUrl}/baselines/${response.baseline.id}`,
      diffUrl: response.diff
        ? `${this.baseUrl}/projects/${projectId}/diff/${response.baseline.version - 1}/${response.baseline.version}`
        : undefined,
    };
  }

  async getHistory(projectId: string, limit: number = 10): Promise<BaselineVersion[]> {
    const response = await this.request<{
      baselines: BaselineVersion[];
      total: number;
    }>('GET', `/projects/${projectId}/baselines?limit=${limit}`);

    return response.baselines;
  }

  async getBaseline(baselineId: string): Promise<BellwetherBaseline | null> {
    try {
      const response = await this.request<BellwetherBaseline>(
        'GET',
        `/baselines/${baselineId}/download`
      );
      return response;
    } catch {
      return null;
    }
  }

  async getDiff(
    projectId: string,
    fromVersion: number,
    toVersion: number
  ): Promise<DiffSummary> {
    const response = await this.request<{
      diff: {
        summary: DiffSummary;
        details: unknown;
        fromVersion: number;
        toVersion: number;
      };
    }>('GET', `/projects/${projectId}/diff/${fromVersion}/${toVersion}`);

    return response.diff.summary;
  }

  async getLatestDiff(projectId: string): Promise<DiffSummary | null> {
    try {
      const response = await this.request<{
        diff: {
          summary: DiffSummary;
          details: unknown;
          fromVersion: number;
          toVersion: number;
        } | null;
      }>('GET', `/projects/${projectId}/latest-diff`);

      return response.diff?.summary ?? null;
    } catch {
      return null;
    }
  }

  async getBadgeInfo(projectId: string): Promise<BadgeInfo | null> {
    try {
      const response = await this.request<{ badge: BadgeInfo }>(
        'GET',
        `/projects/${projectId}/badge`
      );
      return response.badge;
    } catch {
      return null;
    }
  }
}
