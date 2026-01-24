/**
 * validate-config command - Validate bellwether.yaml without running tests.
 */

import { Command } from 'commander';
import { loadConfig, ConfigNotFoundError } from '../../config/loader.js';
import { getConfigWarnings } from '../../config/validator.js';
import { EXIT_CODES, PATHS } from '../../constants.js';
import * as output from '../output.js';

export const validateConfigCommand = new Command('validate-config')
  .description('Validate bellwether.yaml configuration without running tests')
  .option('-c, --config <path>', 'Path to config file', PATHS.DEFAULT_CONFIG_FILENAME)
  .action((options) => {
    try {
      const config = loadConfig(options.config);
      output.success('Configuration is valid.');

      const warnings = getConfigWarnings(config);
      if (warnings.length > 0) {
        output.warn('Configuration warnings:');
        for (const warning of warnings) {
          output.warn(`  - ${warning}`);
        }
      }

      process.exit(EXIT_CODES.CLEAN);
    } catch (error) {
      if (error instanceof ConfigNotFoundError) {
        output.error(error.message);
      } else {
        output.error(error instanceof Error ? error.message : String(error));
      }
      process.exit(EXIT_CODES.ERROR);
    }
  });
