/**
 * Tests for the profile management CLI command.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse, stringify } from 'yaml';

describe('profile command', () => {
  let testDir: string;
  let originalHome: string | undefined;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let processExitSpy: MockInstance;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-profile-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    mkdirSync(join(testDir, '.bellwether', 'profiles'), { recursive: true });

    consoleOutput = [];
    consoleErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      consoleOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrors.push(args.join(' '));
    });

    originalExit = process.exit;
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`Process exit: ${code}`);
    });
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    process.exit = originalExit;
    vi.restoreAllMocks();
    vi.resetModules();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('profile create', () => {
    it('should create a new profile', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'create', 'myprofile', '--provider', 'openai']);

      expect(consoleOutput.some(line => line.includes("'myprofile' created"))).toBe(true);

      const profilePath = join(testDir, '.bellwether', 'profiles', 'myprofile.yaml');
      expect(existsSync(profilePath)).toBe(true);

      const content = readFileSync(profilePath, 'utf-8');
      const profile = parse(content);
      expect(profile.name).toBe('myprofile');
      expect(profile.llm.provider).toBe('openai');
    });

    it('should create profile with model option', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'create', 'gpt4profile', '--provider', 'openai', '--model', 'gpt-4o']);

      const profilePath = join(testDir, '.bellwether', 'profiles', 'gpt4profile.yaml');
      const content = readFileSync(profilePath, 'utf-8');
      const profile = parse(content);
      expect(profile.llm.model).toBe('gpt-4o');
    });

    it('should create profile with max-questions option', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'create', 'limited', '--max-questions', '3']);

      const profilePath = join(testDir, '.bellwether', 'profiles', 'limited.yaml');
      const content = readFileSync(profilePath, 'utf-8');
      const profile = parse(content);
      expect(profile.interview.maxQuestionsPerTool).toBe(3);
    });

    it('should create profile with personas option', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'create', 'personas', '--personas', 'security,developer']);

      const profilePath = join(testDir, '.bellwether', 'profiles', 'personas.yaml');
      const content = readFileSync(profilePath, 'utf-8');
      const profile = parse(content);
      expect(profile.interview.personas).toEqual(['security', 'developer']);
    });

    it('should fail if profile already exists', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'create', 'existing']);

      consoleOutput = [];
      consoleErrors = [];

      await expect(
        profileCommand.parseAsync(['node', 'test', 'create', 'existing'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('already exists'))).toBe(true);
    });

    it('should set as current with --use flag', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'create', 'setcurrent', '--use']);

      expect(consoleOutput.some(line => line.includes('current profile'))).toBe(true);

      const currentPath = join(testDir, '.bellwether', 'current-profile');
      expect(existsSync(currentPath)).toBe(true);
      const current = readFileSync(currentPath, 'utf-8').trim();
      expect(current).toBe('setcurrent');
    });
  });

  describe('profile list', () => {
    it('should show empty message when no profiles', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'list']);

      expect(consoleOutput.some(line => line.includes('No profiles found'))).toBe(true);
    });

    it('should list existing profiles', async () => {
      // Create some profiles
      const profile1 = { name: 'dev', llm: { provider: 'openai', model: 'gpt-4o' }, interview: {}, output: {} };
      const profile2 = { name: 'prod', llm: { provider: 'anthropic' }, interview: {}, output: {} };

      writeFileSync(join(testDir, '.bellwether', 'profiles', 'dev.yaml'), stringify(profile1));
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'prod.yaml'), stringify(profile2));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'list']);

      expect(consoleOutput.some(line => line.includes('dev'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('prod'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('openai'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('anthropic'))).toBe(true);
    });

    it('should mark current profile', async () => {
      const profile = { name: 'current', llm: { provider: 'openai' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'current.yaml'), stringify(profile));
      writeFileSync(join(testDir, '.bellwether', 'current-profile'), 'current');

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'list']);

      expect(consoleOutput.some(line => line.includes('(current)'))).toBe(true);
    });
  });

  describe('profile use', () => {
    it('should set current profile', async () => {
      const profile = { name: 'toset', llm: { provider: 'openai' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'toset.yaml'), stringify(profile));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'use', 'toset']);

      expect(consoleOutput.some(line => line.includes("'toset' as current"))).toBe(true);

      const currentPath = join(testDir, '.bellwether', 'current-profile');
      const current = readFileSync(currentPath, 'utf-8').trim();
      expect(current).toBe('toset');
    });

    it('should fail if profile does not exist', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');

      await expect(
        profileCommand.parseAsync(['node', 'test', 'use', 'nonexistent'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('not found'))).toBe(true);
    });
  });

  describe('profile show', () => {
    it('should show profile details', async () => {
      const profile = {
        name: 'detailed',
        llm: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
        interview: { maxQuestionsPerTool: 5, personas: ['security'] },
        output: { format: 'json' },
      };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'detailed.yaml'), stringify(profile));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'show', 'detailed']);

      expect(consoleOutput.some(line => line.includes('detailed'))).toBe(true);
      expect(consoleOutput.some(line => line.includes('anthropic'))).toBe(true);
    });

    it('should show current profile when no name provided', async () => {
      const profile = { name: 'currentshow', llm: { provider: 'openai' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'currentshow.yaml'), stringify(profile));
      writeFileSync(join(testDir, '.bellwether', 'current-profile'), 'currentshow');

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'show']);

      expect(consoleOutput.some(line => line.includes('currentshow'))).toBe(true);
    });

    it('should fail when no profile specified and no current', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');

      await expect(
        profileCommand.parseAsync(['node', 'test', 'show'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('No profile specified'))).toBe(true);
    });
  });

  describe('profile delete', () => {
    it('should delete profile', async () => {
      const profile = { name: 'todelete', llm: { provider: 'openai' }, interview: {}, output: {} };
      const profilePath = join(testDir, '.bellwether', 'profiles', 'todelete.yaml');
      writeFileSync(profilePath, stringify(profile));
      expect(existsSync(profilePath)).toBe(true);

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'delete', 'todelete']);

      expect(consoleOutput.some(line => line.includes('deleted'))).toBe(true);
      expect(existsSync(profilePath)).toBe(false);
    });

    it('should clear current if deleted profile was current', async () => {
      const profile = { name: 'currentdel', llm: { provider: 'openai' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'currentdel.yaml'), stringify(profile));
      writeFileSync(join(testDir, '.bellwether', 'current-profile'), 'currentdel');

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'delete', 'currentdel']);

      const currentPath = join(testDir, '.bellwether', 'current-profile');
      expect(existsSync(currentPath)).toBe(false);
    });

    it('should fail if profile does not exist', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');

      await expect(
        profileCommand.parseAsync(['node', 'test', 'delete', 'nonexistent'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('not found'))).toBe(true);
    });
  });

  describe('profile update', () => {
    it('should update existing profile', async () => {
      const profile = { name: 'toupdate', llm: { provider: 'openai', model: 'gpt-4' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'toupdate.yaml'), stringify(profile));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'update', 'toupdate', '--model', 'gpt-4o']);

      const updated = parse(readFileSync(join(testDir, '.bellwether', 'profiles', 'toupdate.yaml'), 'utf-8'));
      expect(updated.llm.model).toBe('gpt-4o');
    });

    it('should update provider', async () => {
      const profile = { name: 'updateprov', llm: { provider: 'openai' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'updateprov.yaml'), stringify(profile));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'update', 'updateprov', '--provider', 'anthropic']);

      const updated = parse(readFileSync(join(testDir, '.bellwether', 'profiles', 'updateprov.yaml'), 'utf-8'));
      expect(updated.llm.provider).toBe('anthropic');
    });

    it('should update personas', async () => {
      const profile = { name: 'updatepers', llm: { provider: 'openai' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'updatepers.yaml'), stringify(profile));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'update', 'updatepers', '--personas', 'admin,security']);

      const updated = parse(readFileSync(join(testDir, '.bellwether', 'profiles', 'updatepers.yaml'), 'utf-8'));
      expect(updated.interview.personas).toEqual(['admin', 'security']);
    });

    it('should fail if profile does not exist', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');

      await expect(
        profileCommand.parseAsync(['node', 'test', 'update', 'nonexistent', '--model', 'gpt-4o'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('not found'))).toBe(true);
    });
  });

  describe('profile export', () => {
    it('should export profile as YAML', async () => {
      const profile = {
        name: 'toexport',
        llm: { provider: 'openai', model: 'gpt-4o' },
        interview: { maxQuestionsPerTool: 5 },
        output: {},
      };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'toexport.yaml'), stringify(profile));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'export', 'toexport']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('toexport');
      expect(output).toContain('openai');
      expect(output).toContain('gpt-4o');
    });

    it('should export current profile when no name provided', async () => {
      const profile = { name: 'currentexp', llm: { provider: 'anthropic' }, interview: {}, output: {} };
      writeFileSync(join(testDir, '.bellwether', 'profiles', 'currentexp.yaml'), stringify(profile));
      writeFileSync(join(testDir, '.bellwether', 'current-profile'), 'currentexp');

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'export']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('anthropic');
    });
  });

  describe('profile import', () => {
    it('should import profile from YAML file', async () => {
      const profileData = {
        name: 'imported',
        llm: { provider: 'openai', model: 'gpt-4o' },
        interview: { maxQuestionsPerTool: 10 },
        output: { format: 'json' },
      };
      const importFile = join(testDir, 'import.yaml');
      writeFileSync(importFile, stringify(profileData));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'import', importFile]);

      expect(consoleOutput.some(line => line.includes("'imported' imported"))).toBe(true);

      const profilePath = join(testDir, '.bellwether', 'profiles', 'imported.yaml');
      expect(existsSync(profilePath)).toBe(true);
    });

    it('should allow name override with --name', async () => {
      const profileData = {
        name: 'original',
        llm: { provider: 'openai' },
        interview: {},
        output: {},
      };
      const importFile = join(testDir, 'import2.yaml');
      writeFileSync(importFile, stringify(profileData));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');
      await profileCommand.parseAsync(['node', 'test', 'import', importFile, '--name', 'renamed']);

      expect(consoleOutput.some(line => line.includes("'renamed' imported"))).toBe(true);

      const profilePath = join(testDir, '.bellwether', 'profiles', 'renamed.yaml');
      expect(existsSync(profilePath)).toBe(true);
    });

    it('should fail if file not found', async () => {
      const { profileCommand } = await import('../../src/cli/commands/profile.js');

      await expect(
        profileCommand.parseAsync(['node', 'test', 'import', '/nonexistent/path.yaml'])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('not found'))).toBe(true);
    });

    it('should fail if profile has no name', async () => {
      const profileData = {
        llm: { provider: 'openai' },
        interview: {},
        output: {},
      };
      const importFile = join(testDir, 'noname.yaml');
      writeFileSync(importFile, stringify(profileData));

      const { profileCommand } = await import('../../src/cli/commands/profile.js');

      await expect(
        profileCommand.parseAsync(['node', 'test', 'import', importFile])
      ).rejects.toThrow('Process exit: 1');

      expect(consoleErrors.some(line => line.includes('must have a name'))).toBe(true);
    });
  });
});

describe('getActiveProfileConfig', () => {
  let testDir: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    testDir = join(tmpdir(), `bellwether-profile-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, '.bellwether', 'profiles'), { recursive: true });
    originalHome = process.env.HOME;
    process.env.HOME = testDir;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHome !== undefined) {
      process.env.HOME = originalHome;
    }
    vi.resetModules();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should return null when no current profile', async () => {
    const { getActiveProfileConfig } = await import('../../src/cli/commands/profile.js');
    const config = getActiveProfileConfig();
    expect(config).toBeNull();
  });

  it('should return profile config when current profile exists', async () => {
    const profile = {
      name: 'active',
      llm: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
      interview: { maxQuestionsPerTool: 7 },
      output: { format: 'markdown' },
    };
    writeFileSync(join(testDir, '.bellwether', 'profiles', 'active.yaml'), stringify(profile));
    writeFileSync(join(testDir, '.bellwether', 'current-profile'), 'active');

    const { getActiveProfileConfig } = await import('../../src/cli/commands/profile.js');
    const config = getActiveProfileConfig();

    expect(config).not.toBeNull();
    expect(config?.llm.provider).toBe('anthropic');
    expect(config?.llm.model).toBe('claude-3-5-sonnet');
    expect(config?.interview.maxQuestionsPerTool).toBe(7);
  });

  it('should return null if current profile file points to missing profile', async () => {
    writeFileSync(join(testDir, '.bellwether', 'current-profile'), 'missing');

    const { getActiveProfileConfig } = await import('../../src/cli/commands/profile.js');
    const config = getActiveProfileConfig();
    expect(config).toBeNull();
  });
});
