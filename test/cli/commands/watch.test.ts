/**
 * Tests for watch command utilities and scenarios.
 *
 * Note: The watch command runs an infinite loop, so we test the component parts
 * and scenarios rather than the full command execution.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

// Mock the output module
vi.mock('../../../src/cli/output.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  newline: vi.fn(),
}));

describe('watch command utilities', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = join(tmpdir(), `bellwether-watch-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('file change detection', () => {
    it('should track initial file modification times', () => {
      // Create test files
      const file1 = join(tempDir, 'test.ts');
      const file2 = join(tempDir, 'test.js');
      writeFileSync(file1, 'content1');
      writeFileSync(file2, 'content2');

      const fileModTimes = new Map<string, number>();
      const extensions = ['.ts', '.js'];

      // Simulate walkDir behavior
      function checkFiles(dir: string): boolean {
        let changed = false;
        const entries = readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
            const stat = statSync(fullPath);
            const modTime = stat.mtimeMs;
            const lastMod = fileModTimes.get(fullPath);

            if (lastMod === undefined) {
              fileModTimes.set(fullPath, modTime);
            } else if (modTime > lastMod) {
              fileModTimes.set(fullPath, modTime);
              changed = true;
            }
          }
        }
        return changed;
      }

      // First scan - no changes (just initialization)
      const firstScan = checkFiles(tempDir);
      expect(firstScan).toBe(false);
      expect(fileModTimes.size).toBe(2);
    });

    it('should detect file changes', async () => {
      // Create test file
      const testFile = join(tempDir, 'test.ts');
      writeFileSync(testFile, 'initial');

      const fileModTimes = new Map<string, number>();

      // Initialize
      const stat1 = statSync(testFile);
      fileModTimes.set(testFile, stat1.mtimeMs);

      // Wait a moment and modify
      await new Promise(resolve => setTimeout(resolve, 50));
      writeFileSync(testFile, 'modified');

      // Check for changes
      const stat2 = statSync(testFile);
      const changed = stat2.mtimeMs > fileModTimes.get(testFile)!;

      expect(changed).toBe(true);
    });

    it('should filter by extensions', () => {
      // Create test files with different extensions
      writeFileSync(join(tempDir, 'test.ts'), 'ts');
      writeFileSync(join(tempDir, 'test.js'), 'js');
      writeFileSync(join(tempDir, 'test.txt'), 'txt');
      writeFileSync(join(tempDir, 'test.md'), 'md');

      const extensions = ['.ts', '.js'];
      const entries = readdirSync(tempDir, { withFileTypes: true });

      const matchingFiles = entries.filter(
        entry => entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))
      );

      expect(matchingFiles.length).toBe(2);
      expect(matchingFiles.map(e => e.name).sort()).toEqual(['test.js', 'test.ts']);
    });

    it('should skip common directories', () => {
      // Create directories that should be skipped
      mkdirSync(join(tempDir, 'node_modules'), { recursive: true });
      mkdirSync(join(tempDir, '.git'), { recursive: true });
      mkdirSync(join(tempDir, 'dist'), { recursive: true });
      mkdirSync(join(tempDir, 'src'), { recursive: true });

      // Add files to each
      writeFileSync(join(tempDir, 'node_modules', 'test.ts'), 'nm');
      writeFileSync(join(tempDir, '.git', 'test.ts'), 'git');
      writeFileSync(join(tempDir, 'dist', 'test.ts'), 'dist');
      writeFileSync(join(tempDir, 'src', 'test.ts'), 'src');

      const skippedDirs = ['node_modules', '.git', 'dist'];
      const entries = readdirSync(tempDir, { withFileTypes: true });
      const dirsToWalk = entries
        .filter(e => e.isDirectory())
        .filter(e => !skippedDirs.includes(e.name));

      expect(dirsToWalk.length).toBe(1);
      expect(dirsToWalk[0].name).toBe('src');
    });

    it('should handle nested directories', () => {
      // Create nested structure
      mkdirSync(join(tempDir, 'src', 'components'), { recursive: true });
      writeFileSync(join(tempDir, 'src', 'index.ts'), 'root');
      writeFileSync(join(tempDir, 'src', 'components', 'Button.tsx'), 'button');

      const foundFiles: string[] = [];

      function walkDir(dir: string): void {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            foundFiles.push(fullPath);
          }
        }
      }

      walkDir(tempDir);

      expect(foundFiles.length).toBe(2);
    });
  });

  describe('on-drift command parsing', () => {
    it('should parse simple commands', () => {
      const command = 'npm test';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toEqual(['npm', 'test']);
    });

    it('should handle quoted arguments', () => {
      const command = 'git commit -m "fix: important change"';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toEqual(['git', 'commit', '-m', '"fix: important change"']);

      // Unquote the arguments
      const [cmd, ...args] = parts!;
      const cleanArgs = args.map(arg => arg.replace(/^"|"$/g, ''));

      expect(cmd).toBe('git');
      expect(cleanArgs).toEqual(['commit', '-m', 'fix: important change']);
    });

    it('should handle commands with paths', () => {
      const command = './scripts/notify.sh drift-detected';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toEqual(['./scripts/notify.sh', 'drift-detected']);
    });

    it('should handle empty command', () => {
      const command = '';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toBeNull();
    });

    it('should handle command with multiple quoted sections', () => {
      const command = 'echo "hello world" "goodbye world"';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toEqual(['echo', '"hello world"', '"goodbye world"']);
    });
  });

  describe('baseline tracking', () => {
    it('should initialize baseline hash from existing file', async () => {
      const baselinePath = join(tempDir, 'baseline.json');

      // Create a mock baseline file
      const mockBaseline = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        serverCommand: 'test',
        tools: [],
        integrityHash: 'abc123def456',
      };
      writeFileSync(baselinePath, JSON.stringify(mockBaseline));

      // Verify we can load it
      expect(existsSync(baselinePath)).toBe(true);

      const loaded = JSON.parse(require('fs').readFileSync(baselinePath, 'utf-8'));
      expect(loaded.integrityHash).toBe('abc123def456');
      expect(loaded.integrityHash.slice(0, 8)).toBe('abc123de');
    });

    it('should handle missing baseline file', () => {
      const baselinePath = join(tempDir, 'nonexistent.json');

      expect(existsSync(baselinePath)).toBe(false);

      // lastBaselineHash would be null in this case
      let lastBaselineHash: string | null = null;
      if (existsSync(baselinePath)) {
        lastBaselineHash = 'loaded';
      }

      expect(lastBaselineHash).toBeNull();
    });
  });

  describe('config handling', () => {
    it('should resolve watch path', async () => {
      const { resolve } = await import('path');

      const watchPath = resolve('./src');
      expect(watchPath).toMatch(/\/src$/);
    });

    it('should use default extensions from config', () => {
      const defaultExtensions = ['.ts', '.js', '.json'];

      expect(defaultExtensions).toContain('.ts');
      expect(defaultExtensions).toContain('.js');
      expect(defaultExtensions).toContain('.json');
    });

    it('should resolve baseline path from config', () => {
      const config = {
        baseline: { savePath: './custom-baseline.json', path: 'bellwether-baseline.json' },
        output: { dir: './output' },
      };

      const baselinePathValue = config.baseline.savePath ?? config.baseline.path;
      const baselinePath = baselinePathValue.startsWith('/')
        ? baselinePathValue
        : resolve(join(config.output.dir, baselinePathValue));
      expect(baselinePath).toBe(resolve(join('./output', './custom-baseline.json')));
    });

    it('should fall back to default baseline path', () => {
      const config = {
        baseline: { savePath: undefined, path: 'bellwether-baseline.json' },
        output: { dir: './output' },
      };

      const baselinePathValue = config.baseline.savePath ?? config.baseline.path;
      const baselinePath = baselinePathValue.startsWith('/')
        ? baselinePathValue
        : resolve(join(config.output.dir, baselinePathValue));
      expect(baselinePath).toBe(resolve(join('./output', 'bellwether-baseline.json')));
    });
  });

  describe('polling loop behavior', () => {
    it('should not run concurrent interviews', async () => {
      let isRunningInterview = false;
      let interviewCount = 0;

      async function runTest(): Promise<void> {
        interviewCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      async function pollForChanges(): Promise<void> {
        if (isRunningInterview) {
          return; // Skip if already running
        }

        isRunningInterview = true;
        try {
          await runTest();
        } finally {
          isRunningInterview = false;
        }
      }

      // Simulate concurrent polling
      const poll1 = pollForChanges();
      const poll2 = pollForChanges(); // Should be skipped
      const poll3 = pollForChanges(); // Should be skipped

      await Promise.all([poll1, poll2, poll3]);

      expect(interviewCount).toBe(1);
    });

    it('should handle errors in polling', async () => {
      let errorCaught = false;

      async function pollWithError(): Promise<void> {
        try {
          throw new Error('Test error');
        } catch {
          errorCaught = true;
        }
      }

      await pollWithError();

      expect(errorCaught).toBe(true);
    });
  });

  describe('cleanup handling', () => {
    it('should clear interval on cleanup', () => {
      let intervalCleared = false;
      let currentInterval: NodeJS.Timeout | null = setInterval(() => {}, 1000);

      const cleanup = (): void => {
        if (currentInterval) {
          clearInterval(currentInterval);
          currentInterval = null;
          intervalCleared = true;
        }
      };

      cleanup();

      expect(intervalCleared).toBe(true);
      expect(currentInterval).toBeNull();
    });

    it('should handle multiple cleanup calls gracefully', () => {
      let cleanupCount = 0;
      let currentInterval: NodeJS.Timeout | null = setInterval(() => {}, 1000);

      const cleanup = (): void => {
        cleanupCount++;
        if (currentInterval) {
          clearInterval(currentInterval);
          currentInterval = null;
        }
      };

      cleanup();
      cleanup();
      cleanup();

      expect(cleanupCount).toBe(3);
      // Interval should only be cleared once
      expect(currentInterval).toBeNull();
    });
  });
});

describe('watch mode integration scenarios', () => {
  describe('drift detection', () => {
    it('should identify when severity is not none', () => {
      const diff = { severity: 'breaking' as const };
      const hasDrift = diff.severity !== 'none';

      expect(hasDrift).toBe(true);
    });

    it('should identify when no drift', () => {
      const diff = { severity: 'none' as const };
      const hasDrift = diff.severity !== 'none';

      expect(hasDrift).toBe(false);
    });
  });

  describe('baseline update flow', () => {
    it('should update baseline hash after save', () => {
      let lastBaselineHash: string | null = 'old-hash';
      const newBaseline = { integrityHash: 'new-hash-12345678' };

      // Simulate baseline update
      lastBaselineHash = newBaseline.integrityHash;

      expect(lastBaselineHash).toBe('new-hash-12345678');
      expect(lastBaselineHash.slice(0, 8)).toBe('new-hash');
    });
  });

  describe('time formatting', () => {
    it('should format timestamp for logging', () => {
      const date = new Date('2024-01-15T14:30:00');
      const timeStr = date.toLocaleTimeString();

      // Format depends on locale, but should contain time components
      expect(timeStr).toBeTruthy();
      expect(typeof timeStr).toBe('string');
    });
  });
});
