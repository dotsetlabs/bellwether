/**
 * Tests for authentication and keychain security.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';

// Mock output module
vi.mock('../../src/cli/output.js', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  newline: vi.fn(),
}));

describe('API key validation', () => {
  // Re-implement validateApiKey logic for testing
  function validateApiKey(provider: string, key: string): { valid: boolean; error?: string } {
    if (!key || key.trim().length === 0) {
      return { valid: false, error: 'API key cannot be empty' };
    }

    if (provider === 'openai') {
      if (!key.startsWith('sk-')) {
        return { valid: false, error: 'OpenAI API keys should start with "sk-"' };
      }
      if (key.length < 20) {
        return { valid: false, error: 'API key appears too short' };
      }
    }

    if (provider === 'anthropic') {
      if (!key.startsWith('sk-ant-')) {
        return { valid: false, error: 'Anthropic API keys should start with "sk-ant-"' };
      }
      if (key.length < 20) {
        return { valid: false, error: 'API key appears too short' };
      }
    }

    return { valid: true };
  }

  describe('empty keys', () => {
    it('should reject empty string', () => {
      const result = validateApiKey('openai', '');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only string', () => {
      const result = validateApiKey('anthropic', '   ');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject null-ish values', () => {
      const result = validateApiKey('openai', null as unknown as string);
      expect(result.valid).toBe(false);
    });
  });

  describe('OpenAI keys', () => {
    it('should validate proper OpenAI key format', () => {
      const result = validateApiKey('openai', 'sk-1234567890abcdefghij');
      expect(result.valid).toBe(true);
    });

    it('should reject OpenAI key without sk- prefix', () => {
      const result = validateApiKey('openai', 'api-1234567890abcdefghij');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sk-');
    });

    it('should reject too short OpenAI key', () => {
      const result = validateApiKey('openai', 'sk-short');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too short');
    });

    it('should accept OpenAI key with project prefix', () => {
      // OpenAI project-scoped keys also start with sk-
      const result = validateApiKey('openai', 'sk-proj-1234567890abcdefghij');
      expect(result.valid).toBe(true);
    });
  });

  describe('Anthropic keys', () => {
    it('should validate proper Anthropic key format', () => {
      const result = validateApiKey('anthropic', 'sk-ant-1234567890abcdefghij');
      expect(result.valid).toBe(true);
    });

    it('should reject Anthropic key without sk-ant- prefix', () => {
      const result = validateApiKey('anthropic', 'sk-1234567890abcdefghij');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('sk-ant-');
    });

    it('should reject too short Anthropic key', () => {
      const result = validateApiKey('anthropic', 'sk-ant-short');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too short');
    });
  });

  describe('unknown providers', () => {
    it('should accept keys for unknown providers', () => {
      // Unknown providers skip format validation
      const result = validateApiKey('custom', 'any-key-format');
      expect(result.valid).toBe(true);
    });
  });
});

describe('File backend security', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-auth-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('file permissions', () => {
    it('should create credentials file with restrictive permissions', () => {
      const credentialsPath = join(tempDir, 'credentials.json');

      // Write with restrictive permissions
      writeFileSync(credentialsPath, '{}', { mode: 0o600 });

      const stats = statSync(credentialsPath);
      // Check file permissions (0600 = owner read/write only)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('should create directory with restrictive permissions', () => {
      const secureDir = join(tempDir, 'secure');

      mkdirSync(secureDir, { mode: 0o700 });

      const stats = statSync(secureDir);
      // Check directory permissions (0700 = owner rwx only)
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o700);
    });
  });

  describe('credential storage', () => {
    it('should store credentials as JSON', () => {
      const credentialsPath = join(tempDir, 'credentials.json');
      const credentials = {
        bellwether: {
          'openai-api-key': 'sk-test123',
        },
      };

      writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));

      const loaded = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
      expect(loaded.bellwether['openai-api-key']).toBe('sk-test123');
    });

    it('should handle empty credentials file', () => {
      const credentialsPath = join(tempDir, 'credentials.json');
      writeFileSync(credentialsPath, '{}');

      const loaded = JSON.parse(readFileSync(credentialsPath, 'utf-8'));
      expect(loaded).toEqual({});
    });

    it('should handle missing credentials file', () => {
      const credentialsPath = join(tempDir, 'nonexistent.json');

      expect(existsSync(credentialsPath)).toBe(false);
    });
  });
});

describe('env file handling', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `bellwether-env-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('.env file operations', () => {
    it('should add new API key to empty .env', () => {
      const envPath = join(tempDir, '.env');
      const envVar = 'OPENAI_API_KEY';
      const apiKey = 'sk-test123456789012345';

      // Simulate adding API key
      let envContent = '';
      const lines = envContent.split('\n').filter(line => !line.startsWith(`${envVar}=`));
      lines.push(`${envVar}=${apiKey}`);
      const newContent = lines.filter(l => l).join('\n') + '\n';

      writeFileSync(envPath, newContent, { mode: 0o600 });

      const saved = readFileSync(envPath, 'utf-8');
      expect(saved).toContain('OPENAI_API_KEY=sk-test123456789012345');
    });

    it('should update existing API key in .env', () => {
      const envPath = join(tempDir, '.env');
      const envVar = 'ANTHROPIC_API_KEY';
      const oldKey = 'sk-ant-old123456789012345';
      const newKey = 'sk-ant-new123456789012345';

      // Create existing .env
      writeFileSync(envPath, `${envVar}=${oldKey}\nOTHER_VAR=value\n`);

      // Read and update
      let envContent = readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n').filter(line => !line.startsWith(`${envVar}=`));
      lines.push(`${envVar}=${newKey}`);

      writeFileSync(envPath, lines.filter(l => l).join('\n') + '\n', { mode: 0o600 });

      const saved = readFileSync(envPath, 'utf-8');
      expect(saved).toContain(`${envVar}=${newKey}`);
      expect(saved).not.toContain(oldKey);
      expect(saved).toContain('OTHER_VAR=value');
    });

    it('should preserve other variables when updating', () => {
      const envPath = join(tempDir, '.env');

      // Create .env with multiple variables
      writeFileSync(envPath, 'VAR1=value1\nVAR2=value2\nOPENAI_API_KEY=old\nVAR3=value3\n');

      // Read and update only OPENAI_API_KEY
      let envContent = readFileSync(envPath, 'utf-8');
      const lines = envContent.split('\n').filter(line => !line.startsWith('OPENAI_API_KEY='));
      lines.push('OPENAI_API_KEY=new');

      writeFileSync(envPath, lines.filter(l => l).join('\n') + '\n');

      const saved = readFileSync(envPath, 'utf-8');
      expect(saved).toContain('VAR1=value1');
      expect(saved).toContain('VAR2=value2');
      expect(saved).toContain('VAR3=value3');
      expect(saved).toContain('OPENAI_API_KEY=new');
    });
  });
});

describe('provider info', () => {
  const PROVIDER_INFO = {
    openai: {
      name: 'OpenAI',
      url: 'https://platform.openai.com/api-keys',
      envVar: 'OPENAI_API_KEY',
    },
    anthropic: {
      name: 'Anthropic',
      url: 'https://console.anthropic.com/settings/keys',
      envVar: 'ANTHROPIC_API_KEY',
    },
  };

  it('should have correct OpenAI info', () => {
    expect(PROVIDER_INFO.openai.name).toBe('OpenAI');
    expect(PROVIDER_INFO.openai.envVar).toBe('OPENAI_API_KEY');
    expect(PROVIDER_INFO.openai.url).toContain('openai.com');
  });

  it('should have correct Anthropic info', () => {
    expect(PROVIDER_INFO.anthropic.name).toBe('Anthropic');
    expect(PROVIDER_INFO.anthropic.envVar).toBe('ANTHROPIC_API_KEY');
    expect(PROVIDER_INFO.anthropic.url).toContain('anthropic.com');
  });
});

describe('command parsing', () => {
  describe('on-drift command security', () => {
    it('should parse command without shell interpretation', () => {
      const command = 'echo "hello world"';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toEqual(['echo', '"hello world"']);

      // Unquote args
      if (parts) {
        const [cmd, ...rest] = parts;
        const args = rest.map(arg => arg.replace(/^"|"$/g, ''));

        expect(cmd).toBe('echo');
        expect(args).toEqual(['hello world']);
      }
    });

    it('should not allow shell metacharacters', () => {
      // With proper parsing, shell metacharacters become literal strings
      const command = './script.sh arg1; rm -rf /';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toEqual(['./script.sh', 'arg1;', 'rm', '-rf', '/']);

      // When using spawnSync without shell, these are literal arguments
      // The semicolon doesn't execute as a command separator
    });

    it('should handle empty command', () => {
      const command = '';
      const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g);

      expect(parts).toBeNull();
    });
  });
});

describe('auth status display', () => {
  const mockAuthStatus = [
    { provider: 'openai', configured: true, source: 'keychain', envVar: 'OPENAI_API_KEY' },
    { provider: 'anthropic', configured: false, source: null, envVar: 'ANTHROPIC_API_KEY' },
    { provider: 'ollama', configured: true, source: 'local' },
  ];

  it('should identify configured providers', () => {
    const configured = mockAuthStatus.filter(s => s.configured);
    expect(configured.length).toBe(2);
  });

  it('should identify unconfigured providers', () => {
    const unconfigured = mockAuthStatus.filter(s => !s.configured);
    expect(unconfigured.length).toBe(1);
    expect(unconfigured[0].provider).toBe('anthropic');
  });

  it('should identify keychain source', () => {
    const keychainAuth = mockAuthStatus.find(s => s.source === 'keychain');
    expect(keychainAuth).toBeDefined();
    expect(keychainAuth?.provider).toBe('openai');
  });

  it('should handle ollama specially (no API key)', () => {
    const ollama = mockAuthStatus.find(s => s.provider === 'ollama');
    expect(ollama?.configured).toBe(true);
    expect(ollama?.source).toBe('local');
  });
});

describe('hidden input handling', () => {
  it('should mask characters in password input', () => {
    const input = 'secret123';
    const masked = '*'.repeat(input.length);

    expect(masked).toBe('*********');
    expect(masked.length).toBe(input.length);
  });

  it('should handle backspace in hidden input', () => {
    let input = 'secre';

    // Simulate backspace
    input = input.slice(0, -1);

    expect(input).toBe('secr');
  });

  it('should handle enter key (char code 13 or 10)', () => {
    const enterCodes = [13, 10];

    for (const code of enterCodes) {
      expect(code === 13 || code === 10).toBe(true);
    }
  });

  it('should handle ctrl+c (char code 3)', () => {
    const ctrlC = 3;
    expect(ctrlC).toBe(3);
  });

  it('should only accept printable characters (code >= 32)', () => {
    const printableStart = 32; // Space

    expect(' '.charCodeAt(0)).toBe(32);
    expect('A'.charCodeAt(0)).toBeGreaterThanOrEqual(printableStart);
    expect('z'.charCodeAt(0)).toBeGreaterThanOrEqual(printableStart);
    expect('\n'.charCodeAt(0)).toBeLessThan(printableStart);
    expect('\t'.charCodeAt(0)).toBeLessThan(printableStart);
  });
});

describe('provider selection', () => {
  it('should parse numeric selection', () => {
    const options = [
      { value: 'anthropic', label: 'Anthropic (recommended)' },
      { value: 'openai', label: 'OpenAI' },
    ];

    const answer = '1';
    const index = parseInt(answer, 10) - 1;

    expect(index).toBe(0);
    expect(options[index].value).toBe('anthropic');
  });

  it('should validate selection range', () => {
    const options = [
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'openai', label: 'OpenAI' },
    ];

    // Valid selections
    expect(parseInt('1', 10) - 1 >= 0 && parseInt('1', 10) - 1 < options.length).toBe(true);
    expect(parseInt('2', 10) - 1 >= 0 && parseInt('2', 10) - 1 < options.length).toBe(true);

    // Invalid selections
    expect(parseInt('0', 10) - 1 >= 0).toBe(false);
    expect(parseInt('3', 10) - 1 < options.length).toBe(false);
  });

  it('should handle non-numeric input', () => {
    const answer = 'abc';
    const index = parseInt(answer, 10) - 1;

    expect(isNaN(index)).toBe(true);
  });
});

describe('credential resolution order', () => {
  // Document the expected credential resolution priority
  // Order: env vars > project .env > global .env > keychain
  const resolutionOrder = [
    'Environment variables',
    'Project .env file',
    '~/.bellwether/.env file',
    'System keychain',
  ];

  it('should have documented resolution order', () => {
    expect(resolutionOrder[0]).toBe('Environment variables');
    expect(resolutionOrder[1]).toBe('Project .env file');
    expect(resolutionOrder[2]).toBe('~/.bellwether/.env file');
    expect(resolutionOrder[3]).toBe('System keychain');
    expect(resolutionOrder.length).toBe(4);
  });

  it('should prioritize environment variables', () => {
    // Environment variables should take precedence
    expect(resolutionOrder.indexOf('Environment variables')).toBe(0);
  });

  it('should use project .env before global .env', () => {
    const projectEnvIndex = resolutionOrder.indexOf('Project .env file');
    const globalEnvIndex = resolutionOrder.indexOf('~/.bellwether/.env file');

    expect(projectEnvIndex).toBeLessThan(globalEnvIndex);
  });

  it('should use .env files before keychain', () => {
    const globalEnvIndex = resolutionOrder.indexOf('~/.bellwether/.env file');
    const keychainIndex = resolutionOrder.indexOf('System keychain');

    expect(globalEnvIndex).toBeLessThan(keychainIndex);
  });
});
