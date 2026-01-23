import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isCI } from '../../../src/cli/utils/env.js';

describe('isCI', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns false when no CI environment variables are set', () => {
    delete process.env.CI;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
    delete process.env.CIRCLECI;
    delete process.env.TRAVIS;

    expect(isCI()).toBe(false);
  });

  it('returns true when CI is set', () => {
    process.env.CI = 'true';

    expect(isCI()).toBe(true);
  });

  it('returns true when a known CI variable is set', () => {
    delete process.env.CI;
    process.env.GITHUB_ACTIONS = 'true';

    expect(isCI()).toBe(true);
  });
});
