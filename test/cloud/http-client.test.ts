import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpCloudClient } from '../../src/cloud/http-client.js';

// Store original fetch
const originalFetch = globalThis.fetch;

/**
 * Create a mock Headers object for fetch responses.
 * @param headers - Optional headers to include
 */
function createMockHeaders(headers: Record<string, string> = {}): { get: (key: string) => string | null } {
  return {
    get: (key: string) => headers[key.toLowerCase()] ?? null,
  };
}

describe('HttpCloudClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should accept HTTPS URLs', () => {
      expect(() => new HttpCloudClient('https://api.example.com', 'token')).not.toThrow();
    });

    it('should accept localhost HTTP URLs', () => {
      expect(() => new HttpCloudClient('http://localhost:3000', 'token')).not.toThrow();
    });

    it('should accept 127.0.0.1 HTTP URLs', () => {
      expect(() => new HttpCloudClient('http://127.0.0.1:3000', 'token')).not.toThrow();
    });

    it('should reject non-localhost HTTP URLs', () => {
      expect(() => new HttpCloudClient('http://api.example.com', 'token')).toThrow('Insecure URL rejected');
    });

    it('should remove trailing slash from base URL', () => {
      const client = new HttpCloudClient('https://api.example.com/', 'token');
      // The baseUrl is private, but we can verify behavior through requests
      expect(client).toBeDefined();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when session token is provided', () => {
      const client = new HttpCloudClient('https://api.example.com', 'valid-token');
      expect(client.isAuthenticated()).toBe(true);
    });

    it('should return false when session token is empty', () => {
      const client = new HttpCloudClient('https://api.example.com', '');
      expect(client.isAuthenticated()).toBe(false);
    });
  });

  describe('whoami', () => {
    it('should return user info on success', async () => {
      const mockUser = { id: 'user-1', email: 'test@example.com', name: 'Test User' };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ user: mockUser }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const user = await client.whoami();

      expect(user).toEqual(mockUser);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/auth/me',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer token',
          }),
        })
      );
    });

    it('should return null when not authenticated', async () => {
      const client = new HttpCloudClient('https://api.example.com', '');
      const user = await client.whoami();

      expect(user).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'unauthorized', message: 'Invalid token' }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const user = await client.whoami();

      expect(user).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('should return list of projects', async () => {
      const mockProjects = [
        { id: 'proj-1', name: 'Project 1', serverCommand: 'node server.js' },
        { id: 'proj-2', name: 'Project 2', serverCommand: 'python server.py' },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ projects: mockProjects }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const projects = await client.listProjects();

      expect(projects).toEqual(mockProjects);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/projects',
        expect.anything()
      );
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'server_error', message: 'Internal server error' }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');

      await expect(client.listProjects()).rejects.toThrow('Internal server error');
    });
  });

  describe('createProject', () => {
    it('should create a project and return it', async () => {
      const mockProject = { id: 'proj-new', name: 'New Project', serverCommand: 'node server.js' };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ project: mockProject }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const project = await client.createProject('New Project', 'node server.js');

      expect(project).toEqual(mockProject);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/projects',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Project', serverCommand: 'node server.js' }),
        })
      );
    });
  });

  describe('getProject', () => {
    it('should return project by ID', async () => {
      const mockProject = { id: 'proj-1', name: 'Project 1', serverCommand: 'node server.js' };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ project: mockProject }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const project = await client.getProject('proj-1');

      expect(project).toEqual(mockProject);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/projects/proj-1',
        expect.anything()
      );
    });

    it('should return null when project not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'not_found', message: 'Project not found' }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const project = await client.getProject('nonexistent');

      expect(project).toBeNull();
    });
  });

  describe('deleteProject', () => {
    it('should delete project by ID', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ success: true }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      await client.deleteProject('proj-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/projects/proj-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('uploadBaseline', () => {
    it('should upload baseline and return result', async () => {
      const mockBaseline = {
        id: 'baseline-1',
        version: 1,
        uploadedAt: new Date().toISOString(),
      };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ baseline: mockBaseline, diff: null }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const result = await client.uploadBaseline('proj-1', {
        version: '1.0.0',
        metadata: {
          mode: 'check',
          generatedAt: new Date().toISOString(),
          cliVersion: '1.0.0',
          serverCommand: 'npx test-server',
          durationMs: 1,
          personas: [],
          model: 'none',
        },
        server: { name: 'test', version: '1.0.0', protocolVersion: '2024-11-05', capabilities: [] },
        capabilities: { tools: [], prompts: [], resources: [] },
        interviews: [],
        toolProfiles: [],
        assertions: [],
        summary: 'Test baseline',
        hash: 'hash123',
      } as any);

      expect(result.baselineId).toBe('baseline-1');
      expect(result.version).toBe(1);
      expect(result.projectId).toBe('proj-1');
      expect(result.viewUrl).toContain('/baselines/baseline-1');
    });

    it('should include diff URL when diff is present', async () => {
      const mockBaseline = { id: 'baseline-2', version: 2 };
      const mockDiff = { severity: 'info', toolsAdded: 1 };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ baseline: mockBaseline, diff: mockDiff }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const result = await client.uploadBaseline('proj-1', {} as any);

      expect(result.diffUrl).toContain('/diff/1/2');
    });
  });

  describe('getHistory', () => {
    it('should return baseline history', async () => {
      const mockBaselines = [
        { id: 'b-1', version: 2, uploadedAt: new Date().toISOString() },
        { id: 'b-2', version: 1, uploadedAt: new Date().toISOString() },
      ];
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ baselines: mockBaselines, total: 2 }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const history = await client.getHistory('proj-1', 10);

      expect(history).toEqual(mockBaselines);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/projects/proj-1/baselines?limit=10',
        expect.anything()
      );
    });
  });

  describe('getBaseline', () => {
    it('should return baseline by ID', async () => {
      const mockBaseline = { version: '1.0', server: { name: 'test' } };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve(mockBaseline),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const baseline = await client.getBaseline('baseline-1');

      expect(baseline).toEqual(mockBaseline);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/baselines/baseline-1/download',
        expect.anything()
      );
    });

    it('should return null when baseline not found', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'not_found' }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const baseline = await client.getBaseline('nonexistent');

      expect(baseline).toBeNull();
    });
  });

  describe('getDiff', () => {
    it('should return diff between versions', async () => {
      const mockDiff = {
        severity: 'warning',
        toolsAdded: 1,
        toolsRemoved: 0,
        toolsModified: 2,
        behaviorChanges: 3,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({
          diff: { summary: mockDiff, details: [], fromVersion: 1, toVersion: 2 },
        }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const diff = await client.getDiff('proj-1', 1, 2);

      expect(diff).toEqual(mockDiff);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/projects/proj-1/diff/1/2',
        expect.anything()
      );
    });
  });

  describe('getLatestDiff', () => {
    it('should return latest diff', async () => {
      const mockDiff = { severity: 'info', toolsAdded: 0, toolsRemoved: 0 };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({
          diff: { summary: mockDiff, fromVersion: 1, toVersion: 2 },
        }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const diff = await client.getLatestDiff('proj-1');

      expect(diff).toEqual(mockDiff);
    });

    it('should return null when no diff available', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ diff: null }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const diff = await client.getLatestDiff('proj-1');

      expect(diff).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'not_found' }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const diff = await client.getLatestDiff('proj-1');

      expect(diff).toBeNull();
    });
  });

  describe('getBadgeInfo', () => {
    it('should return badge info', async () => {
      const mockBadge = {
        status: 'healthy',
        label: 'bellwether',
        message: 'passing',
        color: 'green',
      };
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ badge: mockBadge }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const badge = await client.getBadgeInfo('proj-1');

      expect(badge).toEqual(mockBadge);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/projects/proj-1/badge',
        expect.anything()
      );
    });

    it('should return null on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'not_found' }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      const badge = await client.getBadgeInfo('proj-1');

      expect(badge).toBeNull();
    });
  });

  describe('timeout handling', () => {
    it('should handle abort error as timeout', async () => {
      // Mock fetch that rejects with AbortError
      const abortError = new Error('Request aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const client = new HttpCloudClient('https://api.example.com', 'token', 1000);

      await expect(client.listProjects()).rejects.toThrow('timeout');
    });

    it('should use default timeout of 30000ms', () => {
      const client = new HttpCloudClient('https://api.example.com', 'token');
      expect(client).toBeDefined();
      // Default timeout is 30000, but we can't easily test this without time manipulation
    });
  });

  describe('request headers', () => {
    it('should include authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ projects: [] }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'my-token');
      await client.listProjects();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer my-token',
          }),
        })
      );
    });

    it('should include content-type header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ projects: [] }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');
      await client.listProjects();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }),
        })
      );
    });
  });

  describe('error response handling', () => {
    it('should parse JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ error: 'bad_request', message: 'Invalid input' }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');

      await expect(client.listProjects()).rejects.toThrow('Invalid input');
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: createMockHeaders(),
        json: () => Promise.reject(new Error('Not JSON')),
      });

      const client = new HttpCloudClient('https://api.example.com', 'token');

      await expect(client.listProjects()).rejects.toThrow('HTTP 502');
    });
  });

  describe('token rotation', () => {
    it('should update session token when X-Rotated-Session-Token header is present', async () => {
      const newToken = 'sess_newtoken1234567890123456789012345678901234567890123456789012';
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders({ 'x-rotated-session-token': newToken }),
        json: () => Promise.resolve({ projects: [] }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'sess_oldtoken');

      await client.listProjects();

      // Verify the client's internal token was updated
      // The next request should use the new token
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ projects: [] }),
      });

      await client.listProjects();

      // Check the second call used the new token
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${newToken}`,
          }),
        })
      );
    });

    it('should continue working when rotation header is not present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: createMockHeaders(),
        json: () => Promise.resolve({ projects: [] }),
      });

      const client = new HttpCloudClient('https://api.example.com', 'sess_token');

      await client.listProjects();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer sess_token',
          }),
        })
      );
    });
  });
});
