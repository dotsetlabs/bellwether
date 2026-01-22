/**
 * Baseline migrate command - upgrade baselines to current format version.
 *
 * This command migrates baseline files from older format versions to the
 * current format version, ensuring compatibility with the latest CLI features.
 */

import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EXIT_CODES } from '../../constants.js';
import * as output from '../output.js';
import { formatVersion } from '../../baseline/version.js';
import {
  migrateBaseline,
  getMigrationInfo,
} from '../../baseline/migrations.js';
import { recalculateIntegrityHash } from '../../baseline/saver.js';
import type { BehavioralBaseline } from '../../baseline/types.js';

/**
 * Default baseline path.
 */
const DEFAULT_BASELINE_PATH = 'bellwether-baseline.json';

/**
 * Load raw baseline JSON without full validation.
 * Used for migration where the format might not match current schema.
 */
function loadRawBaseline(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    throw new Error(`Baseline file not found: ${path}`);
  }

  const content = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Invalid JSON in baseline file ${path}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Save migrated baseline to file.
 */
function saveMigratedBaseline(baseline: BehavioralBaseline, path: string): void {
  const serialized = JSON.stringify(baseline, null, 2);
  writeFileSync(path, serialized, 'utf-8');
}

/**
 * Create the migrate command.
 */
export const migrateCommand = new Command('migrate')
  .description('Migrate baseline to current format version')
  .argument('[path]', 'Path to baseline file', DEFAULT_BASELINE_PATH)
  .option('--dry-run', 'Show what would change without writing')
  .option('-o, --output <path>', 'Output path (default: overwrite input)')
  .option('-f, --force', 'Overwrite output file without prompting')
  .option('--info', 'Show migration info without performing migration')
  .action(async (baselinePath: string, options) => {
    try {
      // Resolve path
      const fullPath = baselinePath.startsWith('/')
        ? baselinePath
        : join(process.cwd(), baselinePath);

      // Load raw baseline
      const rawBaseline = loadRawBaseline(fullPath);

      // Get migration info
      const info = getMigrationInfo(rawBaseline);

      // Info mode - just show status
      if (options.info) {
        output.info('=== Baseline Migration Info ===');
        output.info(`File: ${fullPath}`);
        output.info(`Current format version: ${formatVersion(info.currentVersion)}`);
        output.info(`Target format version: ${formatVersion(info.targetVersion)}`);
        output.info(`Needs migration: ${info.needsMigration ? 'Yes' : 'No'}`);

        if (info.needsMigration) {
          output.info(`Migrations to apply: ${info.migrationsToApply.join(' -> ')}`);
          output.info(`Can migrate: ${info.canMigrate ? 'Yes' : 'No'}`);
        } else {
          output.success('Baseline is already at the current format version.');
        }
        return;
      }

      // Check if migration is needed
      if (!info.needsMigration) {
        output.success(
          `Baseline is already at the current format version (${formatVersion(info.currentVersion)}).`
        );
        return;
      }

      // Check if migration is possible
      if (!info.canMigrate) {
        output.error(
          `Cannot migrate baseline from ${formatVersion(info.currentVersion)} ` +
            `to ${formatVersion(info.targetVersion)}. ` +
            `This may require a newer version of the CLI.`
        );
        process.exit(EXIT_CODES.ERROR);
      }

      // Dry run mode
      if (options.dryRun) {
        output.info('=== Dry Run - No changes will be made ===');
        output.info(`File: ${fullPath}`);
        output.info(
          `Would migrate from ${formatVersion(info.currentVersion)} to ${formatVersion(info.targetVersion)}`
        );
        output.info(`Migrations to apply: ${info.migrationsToApply.join(' -> ')}`);

        // Show what would change
        const migrated = migrateBaseline(rawBaseline);
        output.info('\nMigrated baseline preview:');
        output.info(`  Version: ${migrated.version}`);
        output.info(`  Tools: ${migrated.tools.length}`);
        output.info(`  Assertions: ${migrated.assertions.length}`);
        if (migrated.workflowSignatures && migrated.workflowSignatures.length > 0) {
          output.info(`  Workflows: ${migrated.workflowSignatures.length}`);
        }
        return;
      }

      // Determine output path
      const outputPath = options.output
        ? options.output.startsWith('/')
          ? options.output
          : join(process.cwd(), options.output)
        : fullPath;

      // Check if output file exists (when different from input)
      if (outputPath !== fullPath && existsSync(outputPath) && !options.force) {
        output.error(`Output file already exists: ${outputPath}`);
        output.error('Use --force to overwrite or specify a different --output path.');
        process.exit(EXIT_CODES.ERROR);
      }

      // Perform migration
      output.info(
        `Migrating baseline from ${formatVersion(info.currentVersion)} to ${formatVersion(info.targetVersion)}...`
      );

      const migrated = migrateBaseline(rawBaseline);

      // Recalculate integrity hash after migration
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { integrityHash: _, ...baselineWithoutHash } = migrated;
      const finalBaseline = recalculateIntegrityHash(baselineWithoutHash);

      // Save migrated baseline
      saveMigratedBaseline(finalBaseline, outputPath);

      output.success(`Baseline migrated successfully!`);
      output.info(`  From: ${formatVersion(info.currentVersion)}`);
      output.info(`  To: ${formatVersion(info.targetVersion)}`);
      output.info(`  Output: ${outputPath}`);

      // Show summary
      output.info('\nBaseline summary:');
      output.info(`  Server: ${finalBaseline.server.name} v${finalBaseline.server.version}`);
      output.info(`  Tools: ${finalBaseline.tools.length}`);
      output.info(`  Assertions: ${finalBaseline.assertions.length}`);
      if (finalBaseline.workflowSignatures && finalBaseline.workflowSignatures.length > 0) {
        output.info(`  Workflows: ${finalBaseline.workflowSignatures.length}`);
      }
    } catch (error) {
      output.error(error instanceof Error ? error.message : String(error));
      process.exit(EXIT_CODES.ERROR);
    }
  });
