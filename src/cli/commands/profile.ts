import { Command } from 'commander';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parse, stringify } from 'yaml';
import { z } from 'zod';
import * as output from '../output.js';

/**
 * Zod schema for profile validation to prevent untrusted YAML injection.
 */
const profileSchema = z.object({
  name: z.string().min(1).max(64),
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'ollama']),
    model: z.string().optional(),
  }),
  interview: z.object({
    maxQuestionsPerTool: z.number().positive().optional(),
    personas: z.array(z.string()).optional(),
    timeout: z.number().positive().optional(),
    skipErrorTests: z.boolean().optional(),
  }).optional().default({}),
  output: z.object({
    format: z.enum(['markdown', 'json', 'both']).optional(),
    outputDir: z.string().optional(),
  }).optional().default({}),
});

/**
 * Profile configuration structure.
 */
interface Profile {
  name: string;
  llm: {
    provider: 'openai' | 'anthropic' | 'ollama';
    model?: string;
  };
  interview: {
    maxQuestionsPerTool?: number;
    personas?: string[];
    timeout?: number;
    skipErrorTests?: boolean;
  };
  output: {
    format?: 'markdown' | 'json' | 'both';
    outputDir?: string;
  };
}

const PROFILES_DIR = join(homedir(), '.bellwether', 'profiles');
const CURRENT_PROFILE_FILE = join(homedir(), '.bellwether', 'current-profile');

/**
 * Validate profile name to prevent path traversal attacks.
 * Only alphanumeric characters, hyphens, and underscores are allowed.
 */
function isValidProfileName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name) && name.length > 0 && name.length <= 64;
}

function ensureProfilesDir(): void {
  if (!existsSync(PROFILES_DIR)) {
    mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

function getProfilePath(name: string): string {
  if (!isValidProfileName(name)) {
    throw new Error(`Invalid profile name: "${name}". Only alphanumeric characters, hyphens, and underscores are allowed.`);
  }
  return join(PROFILES_DIR, `${name}.yaml`);
}

function loadProfile(name: string): Profile | null {
  const path = getProfilePath(name);
  if (!existsSync(path)) {
    return null;
  }
  const content = readFileSync(path, 'utf-8');
  return parse(content) as Profile;
}

function saveProfile(profile: Profile): void {
  ensureProfilesDir();
  const path = getProfilePath(profile.name);
  writeFileSync(path, stringify(profile));
}

function deleteProfile(name: string): boolean {
  const path = getProfilePath(name);
  if (!existsSync(path)) {
    return false;
  }
  unlinkSync(path);
  return true;
}

function listProfiles(): string[] {
  ensureProfilesDir();
  return readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''));
}

function getCurrentProfile(): string | null {
  if (!existsSync(CURRENT_PROFILE_FILE)) {
    return null;
  }
  return readFileSync(CURRENT_PROFILE_FILE, 'utf-8').trim();
}

function setCurrentProfile(name: string | null): void {
  ensureProfilesDir();
  if (name) {
    writeFileSync(CURRENT_PROFILE_FILE, name);
  } else if (existsSync(CURRENT_PROFILE_FILE)) {
    unlinkSync(CURRENT_PROFILE_FILE);
  }
}

export const profileCommand = new Command('profile')
  .description('Manage interview profiles')
  .addCommand(
    new Command('create')
      .description('Create a new profile')
      .argument('<name>', 'Profile name')
      .option('-p, --provider <provider>', 'LLM provider (openai, anthropic, ollama)', 'openai')
      .option('-m, --model <model>', 'LLM model')
      .option('-q, --max-questions <n>', 'Max questions per tool')
      .option('--personas <list>', 'Comma-separated list of personas')
      .option('-f, --format <format>', 'Output format (markdown, json, both)')
      .option('--use', 'Set as current profile after creation')
      .action((name: string, options) => {
        if (loadProfile(name)) {
          output.error(`Profile '${name}' already exists. Use 'profile update' to modify it.`);
          process.exit(1);
        }

        const profile: Profile = {
          name,
          llm: {
            provider: options.provider as Profile['llm']['provider'],
            model: options.model,
          },
          interview: {
            maxQuestionsPerTool: options.maxQuestions ? parseInt(options.maxQuestions, 10) : undefined,
            personas: options.personas ? options.personas.split(',').map((s: string) => s.trim()) : undefined,
          },
          output: {
            format: options.format as Profile['output']['format'],
          },
        };

        saveProfile(profile);
        output.info(`Profile '${name}' created.`);

        if (options.use) {
          setCurrentProfile(name);
          output.info(`Set '${name}' as current profile.`);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all profiles')
      .action(() => {
        const profiles = listProfiles();
        const current = getCurrentProfile();

        if (profiles.length === 0) {
          output.info('No profiles found.');
          output.info('Create one with: bellwether profile create <name>');
          return;
        }

        output.info('Available profiles:\n');
        for (const name of profiles) {
          const marker = name === current ? ' (current)' : '';
          const profile = loadProfile(name);
          if (profile) {
            output.info(`  ${name}${marker}`);
            output.info(`    Provider: ${profile.llm.provider}`);
            if (profile.llm.model) {
              output.info(`    Model: ${profile.llm.model}`);
            }
          }
        }
      })
  )
  .addCommand(
    new Command('use')
      .description('Set the current profile')
      .argument('<name>', 'Profile name')
      .action((name: string) => {
        if (!loadProfile(name)) {
          output.error(`Profile '${name}' not found.`);
          output.info('Available profiles: ' + (listProfiles().join(', ') || 'none'));
          process.exit(1);
        }

        setCurrentProfile(name);
        output.info(`Set '${name}' as current profile.`);
      })
  )
  .addCommand(
    new Command('show')
      .description('Show profile details')
      .argument('[name]', 'Profile name (defaults to current)')
      .action((name?: string) => {
        const profileName = name ?? getCurrentProfile();
        if (!profileName) {
          output.error('No profile specified and no current profile set.');
          process.exit(1);
        }

        const profile = loadProfile(profileName);
        if (!profile) {
          output.error(`Profile '${profileName}' not found.`);
          process.exit(1);
        }

        output.info(`Profile: ${profileName}`);
        output.info(stringify(profile));
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a profile')
      .argument('<name>', 'Profile name')
      .action((name: string) => {
        if (!deleteProfile(name)) {
          output.error(`Profile '${name}' not found.`);
          process.exit(1);
        }

        // Clear current if deleted
        if (getCurrentProfile() === name) {
          setCurrentProfile(null);
        }

        output.info(`Profile '${name}' deleted.`);
      })
  )
  .addCommand(
    new Command('update')
      .description('Update an existing profile')
      .argument('<name>', 'Profile name')
      .option('-p, --provider <provider>', 'LLM provider')
      .option('-m, --model <model>', 'LLM model')
      .option('-q, --max-questions <n>', 'Max questions per tool')
      .option('--personas <list>', 'Comma-separated list of personas')
      .option('-f, --format <format>', 'Output format')
      .action((name: string, options) => {
        const profile = loadProfile(name);
        if (!profile) {
          output.error(`Profile '${name}' not found.`);
          process.exit(1);
        }

        if (options.provider) {
          profile.llm.provider = options.provider;
        }
        if (options.model) {
          profile.llm.model = options.model;
        }
        if (options.maxQuestions) {
          profile.interview.maxQuestionsPerTool = parseInt(options.maxQuestions, 10);
        }
        if (options.personas) {
          profile.interview.personas = options.personas.split(',').map((s: string) => s.trim());
        }
        if (options.format) {
          profile.output.format = options.format;
        }

        saveProfile(profile);
        output.info(`Profile '${name}' updated.`);
      })
  )
  .addCommand(
    new Command('export')
      .description('Export profile as YAML')
      .argument('[name]', 'Profile name (defaults to current)')
      .action((name?: string) => {
        const profileName = name ?? getCurrentProfile();
        if (!profileName) {
          output.error('No profile specified and no current profile set.');
          process.exit(1);
        }

        const profile = loadProfile(profileName);
        if (!profile) {
          output.error(`Profile '${profileName}' not found.`);
          process.exit(1);
        }

        output.info(stringify(profile));
      })
  )
  .addCommand(
    new Command('import')
      .description('Import profile from YAML file')
      .argument('<file>', 'YAML file path')
      .option('-n, --name <name>', 'Override profile name')
      .action((file: string, options) => {
        if (!existsSync(file)) {
          output.error(`File not found: ${file}`);
          process.exit(1);
        }

        const content = readFileSync(file, 'utf-8');
        const rawProfile = parse(content);

        // Validate profile against schema to prevent malicious YAML
        const parseResult = profileSchema.safeParse({
          ...rawProfile,
          name: options.name || rawProfile?.name,
        });

        if (!parseResult.success) {
          output.error('Invalid profile format:');
          for (const issue of parseResult.error.issues) {
            output.error(`  - ${issue.path.join('.')}: ${issue.message}`);
          }
          process.exit(1);
        }

        const profile = parseResult.data as Profile;
        saveProfile(profile);
        output.info(`Profile '${profile.name}' imported.`);
      })
  );

/**
 * Get the profile config to merge with main config.
 * Returns null if no current profile is set.
 */
export function getActiveProfileConfig(): Partial<{
  llm: Profile['llm'];
  interview: Profile['interview'];
  output: Profile['output'];
}> | null {
  const current = getCurrentProfile();
  if (!current) return null;

  const profile = loadProfile(current);
  if (!profile) return null;

  return {
    llm: profile.llm,
    interview: profile.interview,
    output: profile.output,
  };
}
