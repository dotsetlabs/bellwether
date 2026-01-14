/**
 * Auth command for managing LLM provider API keys.
 *
 * Provides secure storage via system keychain with fallback to file-based storage.
 * Separate from the `login` command which handles Bellwether Cloud authentication.
 */

import { Command } from 'commander';
import * as readline from 'readline';
import type { LLMProviderId } from '../../llm/client.js';
import { DEFAULT_MODELS } from '../../llm/client.js';
import { getKeychainService } from '../../auth/keychain.js';
import { getAuthStatus } from '../../auth/credentials.js';

/**
 * Provider display names and info.
 */
const PROVIDER_INFO: Record<Exclude<LLMProviderId, 'ollama'>, { name: string; url: string; envVar: string }> = {
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

/**
 * Create a readline interface for prompts.
 */
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt user for input (hidden for passwords).
 */
async function prompt(rl: readline.Interface, question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      // Hide input for sensitive data
      const stdin = process.stdin;
      const stdout = process.stdout;

      stdout.write(question);

      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');

      let input = '';
      const onData = (char: string) => {
        const charCode = char.charCodeAt(0);

        if (charCode === 13 || charCode === 10) {
          // Enter
          stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          stdout.write('\n');
          resolve(input);
        } else if (charCode === 127 || charCode === 8) {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            stdout.clearLine(0);
            stdout.cursorTo(0);
            stdout.write(question + '*'.repeat(input.length));
          }
        } else if (charCode === 3) {
          // Ctrl+C
          process.exit(0);
        } else if (charCode >= 32) {
          // Printable character
          input += char;
          stdout.write('*');
        }
      };

      stdin.on('data', onData);
    } else {
      // Fallback for non-TTY
      rl.question(question, resolve);
    }
  });
}

/**
 * Prompt user to select from a list.
 */
async function promptSelect(
  rl: readline.Interface,
  question: string,
  options: { value: string; label: string }[]
): Promise<string> {
  console.log(question);
  options.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt.label}`);
  });

  const answer = await prompt(rl, `Enter choice (1-${options.length}): `);
  const index = parseInt(answer, 10) - 1;

  if (index >= 0 && index < options.length) {
    return options[index].value;
  }

  console.log('Invalid choice. Please try again.\n');
  return promptSelect(rl, question, options);
}

/**
 * Validate API key format.
 */
function validateApiKey(provider: LLMProviderId, key: string): { valid: boolean; error?: string } {
  if (!key || key.trim().length === 0) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  if (provider === 'openai') {
    // OpenAI keys start with sk-
    if (!key.startsWith('sk-')) {
      return { valid: false, error: 'OpenAI API keys should start with "sk-"' };
    }
    if (key.length < 20) {
      return { valid: false, error: 'API key appears too short' };
    }
  }

  if (provider === 'anthropic') {
    // Anthropic keys start with sk-ant-
    if (!key.startsWith('sk-ant-')) {
      return { valid: false, error: 'Anthropic API keys should start with "sk-ant-"' };
    }
    if (key.length < 20) {
      return { valid: false, error: 'API key appears too short' };
    }
  }

  return { valid: true };
}

/**
 * Interactive auth setup.
 */
async function interactiveSetup(): Promise<void> {
  const rl = createPrompt();

  console.log('Bellwether Authentication Setup');
  console.log('================================\n');

  // Check current status
  const status = await getAuthStatus();
  const configuredProviders = status.filter(s => s.provider !== 'ollama' && s.configured);

  if (configuredProviders.length > 0) {
    console.log('Currently configured:');
    for (const s of configuredProviders) {
      const source = s.source === 'keychain' ? 'keychain' :
                     s.source === 'env' ? `env (${s.envVar})` : s.source;
      console.log(`  - ${PROVIDER_INFO[s.provider as keyof typeof PROVIDER_INFO]?.name ?? s.provider}: ${source}`);
    }
    console.log('');
  }

  // Select provider
  const provider = await promptSelect(rl, 'Which LLM provider would you like to configure?', [
    { value: 'openai', label: 'OpenAI (recommended)' },
    { value: 'anthropic', label: 'Anthropic Claude' },
  ]) as Exclude<LLMProviderId, 'ollama'>;

  const info = PROVIDER_INFO[provider];
  console.log(`\nGet your ${info.name} API key from:`);
  console.log(`  ${info.url}\n`);

  // Get API key
  const apiKey = await prompt(rl, `Enter your ${info.name} API key: `, true);

  // Validate
  const validation = validateApiKey(provider, apiKey);
  if (!validation.valid) {
    console.log(`\nError: ${validation.error}`);
    rl.close();
    process.exit(1);
  }

  // Check keychain availability
  const keychain = getKeychainService();
  const hasSecureKeychain = await keychain.isSecureKeychainAvailable();

  let storageChoice: string;
  if (hasSecureKeychain) {
    storageChoice = await promptSelect(rl, '\nWhere would you like to store the API key?', [
      { value: 'keychain', label: 'System keychain (recommended - most secure)' },
      { value: 'env', label: `Environment file (~/.bellwether/.env)` },
    ]);
  } else {
    console.log('\nNote: System keychain not available. Using file-based storage.');
    storageChoice = 'env';
  }

  // Store the key
  try {
    if (storageChoice === 'keychain') {
      await keychain.setApiKey(provider, apiKey);
      console.log(`\n✓ API key stored in system keychain`);
    } else {
      // Store in ~/.bellwether/.env
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const envDir = path.join(os.homedir(), '.bellwether');
      const envPath = path.join(envDir, '.env');

      if (!fs.existsSync(envDir)) {
        fs.mkdirSync(envDir, { recursive: true, mode: 0o700 });
      }

      // Read existing .env or create new
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
      }

      // Update or add the key
      const envVar = info.envVar;
      const lines = envContent.split('\n').filter(line => !line.startsWith(`${envVar}=`));
      lines.push(`${envVar}=${apiKey}`);

      fs.writeFileSync(envPath, lines.filter(l => l).join('\n') + '\n', { mode: 0o600 });
      console.log(`\n✓ API key stored in ~/.bellwether/.env`);
    }

    console.log(`\nYou're all set! Bellwether will now use ${info.name} for interviews.`);
    console.log(`\nDefault model: ${DEFAULT_MODELS[provider]}`);
    console.log('\nTry it out:');
    console.log('  bellwether interview npx @modelcontextprotocol/server-memory');
  } catch (error) {
    console.error(`\nFailed to store API key: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  rl.close();
}

/**
 * Show auth status.
 */
async function showStatus(): Promise<void> {
  console.log('Bellwether Authentication Status');
  console.log('=================================\n');

  const status = await getAuthStatus();

  for (const s of status) {
    if (s.provider === 'ollama') {
      console.log('Ollama:');
      console.log('  Status: No API key required (local)');
      console.log('  Model:  llama3.2');
      console.log('');
      continue;
    }

    const info = PROVIDER_INFO[s.provider as keyof typeof PROVIDER_INFO];
    if (!info) continue;

    console.log(`${info.name}:`);

    if (s.configured) {
      let sourceDesc: string;
      switch (s.source) {
        case 'keychain':
          sourceDesc = 'System keychain';
          break;
        case 'env':
          sourceDesc = `Environment variable (${s.envVar})`;
          break;
        default:
          sourceDesc = s.source;
      }
      console.log(`  Status: ✓ Configured`);
      console.log(`  Source: ${sourceDesc}`);
      console.log(`  Model:  ${DEFAULT_MODELS[s.provider]}`);
    } else {
      console.log(`  Status: ✗ Not configured`);
      console.log(`  Setup:  Run 'bellwether auth' or set ${info.envVar}`);
    }
    console.log('');
  }

  // Show priority order
  console.log('Credential resolution order:');
  console.log('  1. Environment variables (highest priority)');
  console.log('  2. System keychain');
  console.log('  3. ~/.bellwether/.env file');
  console.log('  4. Project .env file');
}

/**
 * Add a provider.
 */
async function addProvider(providerArg?: string): Promise<void> {
  const rl = createPrompt();

  let provider: Exclude<LLMProviderId, 'ollama'>;

  if (providerArg && (providerArg === 'openai' || providerArg === 'anthropic')) {
    provider = providerArg;
  } else {
    provider = await promptSelect(rl, 'Which provider?', [
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
    ]) as Exclude<LLMProviderId, 'ollama'>;
  }

  const info = PROVIDER_INFO[provider];
  console.log(`\nGet your API key from: ${info.url}\n`);

  const apiKey = await prompt(rl, `Enter ${info.name} API key: `, true);

  const validation = validateApiKey(provider, apiKey);
  if (!validation.valid) {
    console.log(`\nError: ${validation.error}`);
    rl.close();
    process.exit(1);
  }

  const keychain = getKeychainService();
  await keychain.setApiKey(provider, apiKey);

  console.log(`\n✓ ${info.name} API key stored in keychain`);
  rl.close();
}

/**
 * Remove a provider.
 */
async function removeProvider(providerArg?: string): Promise<void> {
  const rl = createPrompt();

  let provider: Exclude<LLMProviderId, 'ollama'>;

  if (providerArg && (providerArg === 'openai' || providerArg === 'anthropic')) {
    provider = providerArg;
  } else {
    provider = await promptSelect(rl, 'Which provider to remove?', [
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
    ]) as Exclude<LLMProviderId, 'ollama'>;
  }

  const keychain = getKeychainService();
  const deleted = await keychain.deleteApiKey(provider);

  if (deleted) {
    console.log(`\n✓ ${PROVIDER_INFO[provider].name} API key removed from keychain`);
  } else {
    console.log(`\nNo ${PROVIDER_INFO[provider].name} API key found in keychain`);
  }

  rl.close();
}

/**
 * The auth command.
 */
export const authCommand = new Command('auth')
  .description('Manage LLM provider API keys')
  .addCommand(
    new Command('status')
      .description('Show authentication status for all providers')
      .action(showStatus)
  )
  .addCommand(
    new Command('add')
      .description('Add or update an API key')
      .argument('[provider]', 'Provider name (openai, anthropic)')
      .action(addProvider)
  )
  .addCommand(
    new Command('remove')
      .description('Remove an API key from keychain')
      .argument('[provider]', 'Provider name (openai, anthropic)')
      .action(removeProvider)
  )
  .addCommand(
    new Command('clear')
      .description('Remove all stored API keys')
      .action(async () => {
        const keychain = getKeychainService();
        await keychain.clearAll();
        console.log('All API keys removed from keychain.');
      })
  )
  .action(interactiveSetup); // Default action is interactive setup
