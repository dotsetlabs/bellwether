/**
 * Output Assertions for E2E tests.
 *
 * Provides a fluent API for asserting on CLI command output.
 */

import { expect } from 'vitest';
import type { CLIResult } from './cli-runner.js';

/**
 * Fluent assertion builder for CLI output.
 */
export class OutputAssertion {
  constructor(private readonly result: CLIResult) {}

  /**
   * Assert that the command exited with code 0.
   */
  expectSuccess(): this {
    expect(
      this.result.exitCode,
      `Expected exit code 0, got ${this.result.exitCode}.\nStdout: ${this.result.stdout}\nStderr: ${this.result.stderr}`
    ).toBe(0);
    return this;
  }

  /**
   * Assert that the command exited with a non-zero code.
   * Optionally specify the expected exit code.
   */
  expectFailure(code?: number): this {
    if (code !== undefined) {
      expect(
        this.result.exitCode,
        `Expected exit code ${code}, got ${this.result.exitCode}`
      ).toBe(code);
    } else {
      expect(
        this.result.exitCode,
        `Expected non-zero exit code, got ${this.result.exitCode}`
      ).not.toBe(0);
    }
    return this;
  }

  /**
   * Assert that the command exited with a specific code.
   */
  expectExitCode(code: number): this {
    expect(
      this.result.exitCode,
      `Expected exit code ${code}, got ${this.result.exitCode}.\nStdout: ${this.result.stdout}\nStderr: ${this.result.stderr}`
    ).toBe(code);
    return this;
  }

  /**
   * Assert that stdout contains the given text.
   */
  expectStdoutContains(text: string): this {
    expect(
      this.result.stdout,
      `Expected stdout to contain "${text}"`
    ).toContain(text);
    return this;
  }

  /**
   * Assert that stdout does not contain the given text.
   */
  expectStdoutNotContains(text: string): this {
    expect(
      this.result.stdout,
      `Expected stdout to not contain "${text}"`
    ).not.toContain(text);
    return this;
  }

  /**
   * Assert that stdout matches the given regular expression.
   */
  expectStdoutMatches(pattern: RegExp): this {
    expect(
      this.result.stdout,
      `Expected stdout to match ${pattern}`
    ).toMatch(pattern);
    return this;
  }

  /**
   * Assert that stdout does not match the given regular expression.
   */
  expectStdoutNotMatches(pattern: RegExp): this {
    expect(
      this.result.stdout,
      `Expected stdout to not match ${pattern}`
    ).not.toMatch(pattern);
    return this;
  }

  /**
   * Assert that stderr contains the given text.
   */
  expectStderrContains(text: string): this {
    expect(
      this.result.stderr,
      `Expected stderr to contain "${text}"`
    ).toContain(text);
    return this;
  }

  /**
   * Assert that stderr does not contain the given text.
   */
  expectStderrNotContains(text: string): this {
    expect(
      this.result.stderr,
      `Expected stderr to not contain "${text}"`
    ).not.toContain(text);
    return this;
  }

  /**
   * Assert that stderr contains any of the given texts.
   */
  expectStderrContainsAny(...texts: string[]): this {
    const found = texts.some((text) => this.result.stderr.includes(text));
    expect(
      found,
      `Expected stderr to contain any of: ${texts.map((t) => `"${t}"`).join(', ')}\nActual stderr: ${this.result.stderr}`
    ).toBe(true);
    return this;
  }

  /**
   * Assert that stderr is empty or contains only whitespace.
   */
  expectNoStderr(): this {
    expect(
      this.result.stderr.trim(),
      `Expected stderr to be empty, but got: ${this.result.stderr}`
    ).toBe('');
    return this;
  }

  /**
   * Assert that stdout is empty or contains only whitespace.
   */
  expectNoStdout(): this {
    expect(
      this.result.stdout.trim(),
      `Expected stdout to be empty, but got: ${this.result.stdout}`
    ).toBe('');
    return this;
  }

  /**
   * Assert that stdout is valid JSON and return the parsed value.
   * Strips known non-JSON prefixes like dotenv messages and CLI status lines.
   * Also handles trailing content after the JSON object/array.
   */
  expectStdoutJson<T = unknown>(): T {
    let stdout = this.result.stdout;

    // Strip dotenv messages that may pollute stdout
    // Pattern: [dotenv@...] ... -- tip: ...
    stdout = stdout.replace(/^\[dotenv@[^\]]+\][^\n]*\n?/gm, '');

    // Strip CLI info messages (Connecting, Discovering, etc.)
    stdout = stdout.replace(/^Connecting to MCP server:[^\n]*\n?/gm, '');
    stdout = stdout.replace(/^Discovering capabilities\.\.\.[^\n]*\n?/gm, '');
    stdout = stdout.replace(/^\{"level":[^\n]*\n?/gm, ''); // Strip JSON log lines

    // Also strip any leading whitespace or blank lines
    stdout = stdout.trim();

    // Try to find JSON in the output - look for opening { or [
    const jsonStart = stdout.search(/^[\[{]/m);
    if (jsonStart > 0) {
      stdout = stdout.slice(jsonStart);
    }

    // Try to extract just the JSON object/array by finding the matching closing bracket
    // This handles cases where CLI outputs summary text after JSON
    if (stdout.startsWith('{')) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = 0; i < stdout.length; i++) {
        const char = stdout[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\' && inString) {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            stdout = stdout.slice(0, i + 1);
            break;
          }
        }
      }
    } else if (stdout.startsWith('[')) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = 0; i < stdout.length; i++) {
        const char = stdout[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\' && inString) {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (char === '[') depth++;
        if (char === ']') {
          depth--;
          if (depth === 0) {
            stdout = stdout.slice(0, i + 1);
            break;
          }
        }
      }
    }

    try {
      return JSON.parse(stdout) as T;
    } catch (e) {
      throw new Error(
        `Expected stdout to be valid JSON.\nStdout: ${this.result.stdout}\nError: ${e}`
      );
    }
  }

  /**
   * Assert that stdout starts with the given text.
   */
  expectStdoutStartsWith(text: string): this {
    expect(
      this.result.stdout.startsWith(text),
      `Expected stdout to start with "${text}"\nActual: ${this.result.stdout.slice(0, 100)}...`
    ).toBe(true);
    return this;
  }

  /**
   * Assert that stdout ends with the given text.
   */
  expectStdoutEndsWith(text: string): this {
    expect(
      this.result.stdout.trimEnd().endsWith(text),
      `Expected stdout to end with "${text}"\nActual: ...${this.result.stdout.slice(-100)}`
    ).toBe(true);
    return this;
  }

  /**
   * Assert that the command completed within the given duration.
   */
  expectDurationLessThan(ms: number): this {
    expect(
      this.result.duration,
      `Expected duration < ${ms}ms, got ${this.result.duration}ms`
    ).toBeLessThan(ms);
    return this;
  }

  /**
   * Assert that stdout contains all of the given texts.
   */
  expectStdoutContainsAll(...texts: string[]): this {
    for (const text of texts) {
      this.expectStdoutContains(text);
    }
    return this;
  }

  /**
   * Assert that stdout contains any of the given texts.
   */
  expectStdoutContainsAny(...texts: string[]): this {
    const found = texts.some((text) => this.result.stdout.includes(text));
    expect(
      found,
      `Expected stdout to contain any of: ${texts.map((t) => `"${t}"`).join(', ')}`
    ).toBe(true);
    return this;
  }

  /**
   * Get the stdout value for custom assertions.
   */
  get stdout(): string {
    return this.result.stdout;
  }

  /**
   * Get the stderr value for custom assertions.
   */
  get stderr(): string {
    return this.result.stderr;
  }

  /**
   * Get the exit code for custom assertions.
   */
  get exitCode(): number {
    return this.result.exitCode;
  }

  /**
   * Get the duration for custom assertions.
   */
  get duration(): number {
    return this.result.duration;
  }

  /**
   * Get the raw result object.
   */
  get raw(): CLIResult {
    return this.result;
  }
}

/**
 * Create an assertion builder for the given CLI result.
 *
 * @example
 * ```typescript
 * const result = await runCLI(['--version']);
 * assertOutput(result)
 *   .expectSuccess()
 *   .expectStdoutContains('bellwether');
 * ```
 */
export function assertOutput(result: CLIResult): OutputAssertion {
  return new OutputAssertion(result);
}

/**
 * Assert that a CLI result was successful and return it.
 * Useful for chaining with other assertions.
 */
export function expectSuccess(result: CLIResult): CLIResult {
  assertOutput(result).expectSuccess();
  return result;
}

/**
 * Assert that a CLI result failed and return it.
 * Useful for chaining with other assertions.
 */
export function expectFailure(result: CLIResult, code?: number): CLIResult {
  assertOutput(result).expectFailure(code);
  return result;
}
