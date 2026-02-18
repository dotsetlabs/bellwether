import { loadConfig, ConfigNotFoundError, type BellwetherConfig } from '../../config/loader.js';
import { EXIT_CODES } from '../../constants.js';
import * as output from '../output.js';

/**
 * Load configuration and exit with a user-friendly message when missing.
 */
export function loadConfigOrExit(configPath?: string): BellwetherConfig {
  try {
    return loadConfig(configPath);
  } catch (error) {
    if (error instanceof ConfigNotFoundError) {
      output.error(error.message);
      process.exit(EXIT_CODES.ERROR);
    }
    throw error;
  }
}
