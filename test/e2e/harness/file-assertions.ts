/**
 * File Assertions for E2E tests.
 *
 * Provides helpers for asserting on file existence, content, and structure.
 */

import { expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'fs';
import type { TempDirectory } from './temp-directory.js';

/**
 * Assert that a file exists.
 */
export function expectFileExists(
  path: string,
  message?: string
): void {
  expect(
    existsSync(path),
    message ?? `Expected file to exist: ${path}`
  ).toBe(true);
}

/**
 * Assert that a file does not exist.
 */
export function expectFileNotExists(
  path: string,
  message?: string
): void {
  expect(
    existsSync(path),
    message ?? `Expected file to not exist: ${path}`
  ).toBe(false);
}

/**
 * Assert that a file contains the given text.
 */
export function expectFileContains(
  path: string,
  text: string,
  message?: string
): void {
  expectFileExists(path);
  const content = readFileSync(path, 'utf-8');
  expect(
    content,
    message ?? `Expected file ${path} to contain "${text}"`
  ).toContain(text);
}

/**
 * Assert that a file does not contain the given text.
 */
export function expectFileNotContains(
  path: string,
  text: string,
  message?: string
): void {
  expectFileExists(path);
  const content = readFileSync(path, 'utf-8');
  expect(
    content,
    message ?? `Expected file ${path} to not contain "${text}"`
  ).not.toContain(text);
}

/**
 * Assert that a file matches the given regex.
 */
export function expectFileMatches(
  path: string,
  pattern: RegExp,
  message?: string
): void {
  expectFileExists(path);
  const content = readFileSync(path, 'utf-8');
  expect(
    content,
    message ?? `Expected file ${path} to match ${pattern}`
  ).toMatch(pattern);
}

/**
 * Assert that a file is valid JSON.
 */
export function expectFileIsJson<T = unknown>(path: string): T {
  expectFileExists(path);
  const content = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(content) as T;
  } catch (e) {
    throw new Error(`Expected file ${path} to be valid JSON: ${e}`);
  }
}

/**
 * Assert that a JSON file contains specific properties.
 */
export function expectJsonFileContains(
  path: string,
  expected: Record<string, unknown>
): void {
  const json = expectFileIsJson<Record<string, unknown>>(path);
  for (const [key, value] of Object.entries(expected)) {
    expect(
      json[key],
      `Expected ${path} to have ${key}=${JSON.stringify(value)}, got ${JSON.stringify(json[key])}`
    ).toEqual(value);
  }
}

/**
 * Assert that a JSON file has specific nested property.
 */
export function expectJsonFileHasProperty(
  path: string,
  propertyPath: string,
  expectedValue?: unknown
): void {
  const json = expectFileIsJson<Record<string, unknown>>(path);
  const keys = propertyPath.split('.');
  let current: unknown = json;

  for (const key of keys) {
    if (current === null || typeof current !== 'object') {
      throw new Error(
        `Expected ${path} to have property ${propertyPath}, but path ended at ${key}`
      );
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (expectedValue !== undefined) {
    expect(
      current,
      `Expected ${path} property ${propertyPath} to equal ${JSON.stringify(expectedValue)}`
    ).toEqual(expectedValue);
  } else {
    expect(
      current,
      `Expected ${path} to have property ${propertyPath}`
    ).toBeDefined();
  }
}

/**
 * Assert that a file has specific size constraints.
 */
export function expectFileSize(
  path: string,
  options: { min?: number; max?: number }
): void {
  expectFileExists(path);
  const stats = statSync(path);

  if (options.min !== undefined) {
    expect(
      stats.size,
      `Expected file ${path} to be at least ${options.min} bytes, got ${stats.size}`
    ).toBeGreaterThanOrEqual(options.min);
  }

  if (options.max !== undefined) {
    expect(
      stats.size,
      `Expected file ${path} to be at most ${options.max} bytes, got ${stats.size}`
    ).toBeLessThanOrEqual(options.max);
  }
}

/**
 * Assert that a file is not empty.
 */
export function expectFileNotEmpty(path: string): void {
  expectFileSize(path, { min: 1 });
}

/**
 * Fluent assertion builder for files.
 */
export class FileAssertion {
  constructor(
    private readonly path: string,
    private readonly tempDir?: TempDirectory
  ) {}

  private get absolutePath(): string {
    return this.tempDir ? this.tempDir.resolve(this.path) : this.path;
  }

  /**
   * Assert that the file exists.
   */
  exists(): this {
    expectFileExists(this.absolutePath);
    return this;
  }

  /**
   * Assert that the file does not exist.
   */
  notExists(): this {
    expectFileNotExists(this.absolutePath);
    return this;
  }

  /**
   * Assert that the file contains the given text.
   */
  contains(text: string): this {
    expectFileContains(this.absolutePath, text);
    return this;
  }

  /**
   * Assert that the file does not contain the given text.
   */
  notContains(text: string): this {
    expectFileNotContains(this.absolutePath, text);
    return this;
  }

  /**
   * Assert that the file matches the given regex.
   */
  matches(pattern: RegExp): this {
    expectFileMatches(this.absolutePath, pattern);
    return this;
  }

  /**
   * Assert that the file is valid JSON and return the parsed content.
   */
  isJson<T = unknown>(): T {
    return expectFileIsJson<T>(this.absolutePath);
  }

  /**
   * Assert that the file is not empty.
   */
  notEmpty(): this {
    expectFileNotEmpty(this.absolutePath);
    return this;
  }

  /**
   * Assert file size constraints.
   */
  hasSize(options: { min?: number; max?: number }): this {
    expectFileSize(this.absolutePath, options);
    return this;
  }

  /**
   * Get the file content for custom assertions.
   */
  get content(): string {
    return readFileSync(this.absolutePath, 'utf-8');
  }
}

/**
 * Create a fluent assertion builder for a file.
 *
 * @example
 * ```typescript
 * assertFile('output.json')
 *   .exists()
 *   .notEmpty()
 *   .isJson();
 *
 * // With temp directory
 * assertFile('CONTRACT.md', tempDir)
 *   .exists()
 *   .contains('# test-server');
 * ```
 */
export function assertFile(path: string, tempDir?: TempDirectory): FileAssertion {
  return new FileAssertion(path, tempDir);
}

/**
 * Assert multiple files exist.
 */
export function expectFilesExist(
  paths: string[],
  tempDir?: TempDirectory
): void {
  for (const path of paths) {
    const absolutePath = tempDir ? tempDir.resolve(path) : path;
    expectFileExists(absolutePath);
  }
}

/**
 * Assert that a directory contains specific files.
 */
export function expectDirectoryContains(
  dir: string,
  files: string[]
): void {
  for (const file of files) {
    expectFileExists(`${dir}/${file}`);
  }
}
