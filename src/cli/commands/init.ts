import { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateDefaultConfig } from '../../config/loader.js';
import * as output from '../output.js';

export const initCommand = new Command('init')
  .description('Initialize a bellwether.yaml configuration file')
  .option('-f, --force', 'Overwrite existing config file')
  .action((options) => {
    const configPath = join(process.cwd(), 'bellwether.yaml');

    if (existsSync(configPath) && !options.force) {
      output.error(`Config file already exists: ${configPath}`);
      output.error('Use --force to overwrite.');
      process.exit(1);
    }

    const content = generateDefaultConfig();
    writeFileSync(configPath, content);

    output.success(`Created: ${configPath}`);
    output.newline();
    output.info('Next steps:');
    output.info('  1. Set your API key (choose one):');
    output.newline();
    output.info('     # Option A: Interactive setup (recommended)');
    output.info('     bellwether auth');
    output.newline();
    output.info('     # Option B: Global .env file');
    output.info('     mkdir -p ~/.bellwether && echo "OPENAI_API_KEY=sk-xxx" >> ~/.bellwether/.env');
    output.newline();
    output.info('     # Option C: Project .env file');
    output.info('     echo "OPENAI_API_KEY=sk-xxx" >> .env');
    output.newline();
    output.info('  2. Run an interview: bellwether interview npx @your/mcp-server');
    output.newline();
    output.info('For more information, see: https://docs.bellwether.sh');
  });
