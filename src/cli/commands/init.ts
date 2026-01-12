import { Command } from 'commander';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { generateDefaultConfig } from '../../config/loader.js';

export const initCommand = new Command('init')
  .description('Initialize an inquest.yaml configuration file')
  .option('-f, --force', 'Overwrite existing config file')
  .action((options) => {
    const configPath = join(process.cwd(), 'inquest.yaml');

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
    console.log('  1. Set your OpenAI API key: export OPENAI_API_KEY=...');
    console.log('  2. Run an interview: inquest interview npx @your/mcp-server');
    console.log('');
    console.log('For more information, see: https://github.com/dotsetlabs/inquest');
  });
