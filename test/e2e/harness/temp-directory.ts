/**
 * Temp Directory Manager for E2E tests.
 *
 * Provides isolated temporary directories for each test with automatic cleanup.
 */

import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { stringify } from 'yaml';

/**
 * Manages a temporary directory for test isolation.
 */
export class TempDirectory {
  /** The absolute path to the temp directory */
  readonly path: string;
  private originalCwd: string | null = null;
  private entered = false;

  constructor(prefix = 'bellwether-e2e') {
    const id = randomBytes(8).toString('hex');
    this.path = join(tmpdir(), `${prefix}-${Date.now()}-${id}`);
    mkdirSync(this.path, { recursive: true });
  }

  /**
   * Change the current working directory to this temp directory.
   * Call leave() to return to the original directory.
   */
  enter(): void {
    if (this.entered) {
      throw new Error('Already entered temp directory');
    }
    this.originalCwd = process.cwd();
    process.chdir(this.path);
    this.entered = true;
  }

  /**
   * Return to the original working directory.
   */
  leave(): void {
    if (!this.entered || this.originalCwd === null) {
      throw new Error('Not in temp directory');
    }
    process.chdir(this.originalCwd);
    this.originalCwd = null;
    this.entered = false;
  }

  /**
   * Write a file to the temp directory.
   * @returns The absolute path to the written file.
   */
  writeFile(relativePath: string, content: string): string {
    const absolutePath = this.resolve(relativePath);
    const dir = join(absolutePath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(absolutePath, content, 'utf-8');
    return absolutePath;
  }

  /**
   * Write a bellwether.yaml config file.
   * @returns The absolute path to the config file.
   */
  writeConfig(config: object): string {
    const content = typeof config === 'string' ? config : stringify(config);
    return this.writeFile('bellwether.yaml', content);
  }

  /**
   * Write a JSON file to the temp directory.
   * @returns The absolute path to the written file.
   */
  writeJson(relativePath: string, data: unknown): string {
    const content = JSON.stringify(data, null, 2);
    return this.writeFile(relativePath, content);
  }

  /**
   * Check if a file or directory exists in the temp directory.
   */
  exists(relativePath: string): boolean {
    return existsSync(this.resolve(relativePath));
  }

  /**
   * Read a file from the temp directory.
   */
  readFile(relativePath: string): string {
    return readFileSync(this.resolve(relativePath), 'utf-8');
  }

  /**
   * Read and parse a JSON file from the temp directory.
   */
  readJson<T = unknown>(relativePath: string): T {
    const content = this.readFile(relativePath);
    return JSON.parse(content) as T;
  }

  /**
   * Get file stats.
   */
  stat(relativePath: string): ReturnType<typeof statSync> {
    return statSync(this.resolve(relativePath));
  }

  /**
   * Resolve a relative path within the temp directory.
   */
  resolve(relativePath: string): string {
    return join(this.path, relativePath);
  }

  /**
   * Create a subdirectory.
   * @returns The absolute path to the directory.
   */
  mkdir(relativePath: string): string {
    const absolutePath = this.resolve(relativePath);
    mkdirSync(absolutePath, { recursive: true });
    return absolutePath;
  }

  /**
   * Delete the temp directory and all its contents.
   */
  cleanup(): void {
    // Make sure we're not in the temp directory
    if (this.entered) {
      this.leave();
    }
    try {
      rmSync(this.path, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors (e.g., directory already deleted)
    }
  }
}

/**
 * Create and use a temp directory for a test.
 * Use with beforeEach/afterEach hooks.
 *
 * @example
 * ```typescript
 * describe('my tests', () => {
 *   let tempDir: TempDirectory;
 *
 *   beforeEach(() => {
 *     tempDir = createTempDirectory();
 *   });
 *
 *   afterEach(() => {
 *     tempDir.cleanup();
 *   });
 *
 *   it('should work', () => {
 *     tempDir.writeConfig({ server: { command: 'test' } });
 *     // test code...
 *   });
 * });
 * ```
 */
export function createTempDirectory(prefix?: string): TempDirectory {
  return new TempDirectory(prefix);
}

/**
 * Hook-based helper for beforeEach/afterEach.
 * Returns a function that creates a new temp directory each time.
 *
 * @example
 * ```typescript
 * describe('my tests', () => {
 *   const getTempDir = useTempDirectory();
 *
 *   it('should work', () => {
 *     const tempDir = getTempDir();
 *     tempDir.writeConfig({ server: { command: 'test' } });
 *   });
 * });
 * ```
 *
 * Note: This approach requires Vitest's globals to be enabled.
 */
export function useTempDirectory(prefix?: string): () => TempDirectory {
  let currentDir: TempDirectory | null = null;

  // Register hooks if we're in a test context (Vitest globals)
  if (typeof beforeEach !== 'undefined' && typeof afterEach !== 'undefined') {
    beforeEach(() => {
      currentDir = new TempDirectory(prefix);
    });

    afterEach(() => {
      if (currentDir) {
        currentDir.cleanup();
        currentDir = null;
      }
    });
  }

  return () => {
    if (!currentDir) {
      // Fallback for cases where hooks weren't registered
      currentDir = new TempDirectory(prefix);
    }
    return currentDir;
  };
}
