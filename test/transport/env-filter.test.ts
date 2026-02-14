import { describe, expect, it } from 'vitest';
import { filterSpawnEnv } from '../../src/transport/env-filter.js';

describe('filterSpawnEnv', () => {
  it('filters known sensitive environment variables from base env', () => {
    const env = filterSpawnEnv({
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'secret',
      DATABASE_URL: 'postgres://secret',
      NODE_ENV: 'test',
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.NODE_ENV).toBe('test');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('filters pattern-based sensitive variables from base env', () => {
    const env = filterSpawnEnv({
      CUSTOM_TOKEN: 'secret',
      SERVICE_SECRET: 'secret',
      SAFE_VALUE: 'ok',
    });

    expect(env.CUSTOM_TOKEN).toBeUndefined();
    expect(env.SERVICE_SECRET).toBeUndefined();
    expect(env.SAFE_VALUE).toBe('ok');
  });

  it('allows explicitly provided additional env variables', () => {
    const env = filterSpawnEnv(
      {
        PATH: '/usr/bin',
      },
      {
        OPENAI_API_KEY: 'intentionally-passed',
        CUSTOM_SETTING: 'value',
      }
    );

    expect(env.PATH).toBe('/usr/bin');
    expect(env.OPENAI_API_KEY).toBe('intentionally-passed');
    expect(env.CUSTOM_SETTING).toBe('value');
  });
});
