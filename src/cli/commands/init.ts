import { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateDefaultConfig } from '../../config/loader.js';

export const initCommand = new Command('init')
  .description('Initialize a bellwether.yaml configuration file')
  .option('-f, --force', 'Overwrite existing config file')
  .action((options) => {
    const configPath = join(process.cwd(), 'bellwether.yaml');

    if (existsSync(configPath) && !options.force) {
      console.error(`Config file already exists: ${configPath}`);
      console.error('Use --force to overwrite.');
      process.exit(1);
    }

    const content = generateDefaultConfig();
    writeFileSync(configPath, content);

    console.log(`Created: ${configPath}`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Set your API key (choose one):');
    console.log('');
    console.log('     # Option A: Global config (recommended - set once, use everywhere)');
    console.log('     mkdir -p ~/.bellwether && echo "OPENAI_API_KEY=sk-xxx" >> ~/.bellwether/.env');
    console.log('');
    console.log('     # Option B: Project .env file');
    console.log('     echo "OPENAI_API_KEY=sk-xxx" >> .env');
    console.log('');
    console.log('     # Option C: Shell environment');
    console.log('     export OPENAI_API_KEY=sk-xxx');
    console.log('');
    console.log('  2. Run an interview: bellwether interview npx @your/mcp-server');
    console.log('');
    console.log('For more information, see: https://bellwether.sh/docs');
  });
