import { describe, it, expect } from 'vitest';
import { extractServerContextFromArgs } from '../../../src/cli/utils/server-context.js';

describe('extractServerContextFromArgs', () => {
  describe('filesystem server detection', () => {
    it('detects filesystem server from command', () => {
      const context = extractServerContextFromArgs('npx @mcp/filesystem', ['/home/user']);

      expect(context.allowedDirectories).toContain('/home/user');
      expect(context.hints?.some((h) => h.includes('Filesystem'))).toBe(true);
      expect(context.constraints?.some((c) => c.includes('limited to specified directories'))).toBe(true);
    });

    it('detects file-system variant', () => {
      const context = extractServerContextFromArgs('node file-system-server.js', ['/data']);

      expect(context.allowedDirectories).toContain('/data');
      expect(context.hints?.some((h) => h.includes('Filesystem'))).toBe(true);
    });

    it('handles multiple path arguments', () => {
      const context = extractServerContextFromArgs('npx @mcp/filesystem', ['/path1', '/path2', '--option', '/path3']);

      expect(context.allowedDirectories).toContain('/path1');
      expect(context.allowedDirectories).toContain('/path2');
      expect(context.allowedDirectories).toContain('/path3');
      expect(context.allowedDirectories).not.toContain('--option');
    });

    it('does not include option flags as paths', () => {
      const context = extractServerContextFromArgs('npx @mcp/filesystem', ['--verbose', '/data']);

      expect(context.allowedDirectories).toContain('/data');
      expect(context.allowedDirectories).not.toContain('--verbose');
    });
  });

  describe('database server detection', () => {
    it('detects postgres server', () => {
      const context = extractServerContextFromArgs('npx @mcp/postgres', ['--connection', 'postgresql://localhost']);

      expect(context.hints?.some((h) => h.includes('Database'))).toBe(true);
      expect(context.constraints?.some((c) => c.includes('Database operations'))).toBe(true);
    });

    it('detects mysql server', () => {
      const context = extractServerContextFromArgs('node mysql-mcp-server', []);

      expect(context.hints?.some((h) => h.includes('Database'))).toBe(true);
    });

    it('detects sqlite server', () => {
      const context = extractServerContextFromArgs('npx sqlite-mcp', ['--db', 'test.db']);

      expect(context.hints?.some((h) => h.includes('Database'))).toBe(true);
    });
  });

  describe('git server detection', () => {
    it('detects git server', () => {
      const context = extractServerContextFromArgs('npx @mcp/git', ['/repo']);

      expect(context.allowedDirectories).toContain('/repo');
      expect(context.hints?.some((h) => h.includes('Git'))).toBe(true);
    });

    it('is case-insensitive for git detection', () => {
      const context = extractServerContextFromArgs('NPX @MCP/GIT', []);

      expect(context.hints?.some((h) => h.includes('Git'))).toBe(true);
    });
  });

  describe('generic server handling', () => {
    it('extracts paths for unknown servers', () => {
      const context = extractServerContextFromArgs('npx @custom/server', ['/custom/path']);

      expect(context.allowedDirectories).toContain('/custom/path');
      expect(context.hints?.some((h) => h.includes('Database'))).toBe(false);
      expect(context.hints?.some((h) => h.includes('Git'))).toBe(false);
    });

    it('handles no arguments', () => {
      const context = extractServerContextFromArgs('npx @custom/server', []);

      expect(context.allowedDirectories).toEqual([]);
    });

    it('returns empty hints for unknown servers', () => {
      const context = extractServerContextFromArgs('npx @custom/server', []);

      expect(context.hints ?? []).toEqual([]);
    });
  });
});
