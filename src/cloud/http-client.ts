/**
 * HTTP cloud client for production API.
 *
 * Makes real HTTP requests to the Inquest Cloud API.
 */

import type {
  InquestCloudClient,
  CloudUser,
  Project,
  BaselineVersion,
  UploadResult,
  DiffSummary,
  InquestBaseline,
} from './types.js';

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
export class HttpCloudClient implements InquestCloudClient {
  private baseUrl: string;
  private token: string;
  private timeout: number;

  constructor(baseUrl: string, token: string, timeout: number = 30000) {
    // Validate HTTPS requirement
    validateSecureUrl(baseUrl);

    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.timeout = timeout;
  }

  /**
   * Make an authenticated request.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

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
  // InquestCloudClient Implementation
  // ============================================================================

  isAuthenticated(): boolean {
    return !!this.token;
  }

  async whoami(): Promise<CloudUser | null> {
    if (!this.token) {
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
    baseline: InquestBaseline,
    _options?: { public?: boolean }
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

  async getBaseline(baselineId: string): Promise<InquestBaseline | null> {
    try {
      const response = await this.request<InquestBaseline>(
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
}
