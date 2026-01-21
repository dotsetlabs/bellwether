/**
 * E2E Test Harness
 *
 * Provides all the infrastructure needed for E2E testing of the Bellwether CLI.
 */

// CLI Runner - spawn CLI as subprocess
export {
  runCLI,
  runCLIWithMockServer,
  getMockServerCommand,
  getMockServerTsCommand,
  getMockServerCommandString,
  getMockServerTsCommandString,
  getMockServerArgs,
  getMockServerTsArgs,
  isCLIBuilt,
  getCLIVersion,
  type CLIResult,
  type CLIOptions,
  type MockServerConfig,
} from './cli-runner.js';

// Temp Directory - isolated test directories
export {
  TempDirectory,
  createTempDirectory,
  useTempDirectory,
} from './temp-directory.js';

// Output Assertions - fluent CLI output assertions
export {
  OutputAssertion,
  assertOutput,
  expectSuccess,
  expectFailure,
} from './output-assertions.js';

// Config Generator - generate bellwether.yaml files
export {
  generateTestConfig,
  generateMinimalConfig,
  generateCIConfig,
  generateLocalConfig,
  generateSecurityConfig,
  generateThoroughConfig,
  generateTestConfigObject,
  updateConfigWithMockServer,
  type ConfigOptions,
  type BellwetherConfig,
  type ServerConfig,
  type LLMConfig,
  type ExploreConfig,
  type OutputConfig,
  type BaselineConfig,
} from './config-generator.js';

// File Assertions - file existence and content assertions
export {
  FileAssertion,
  assertFile,
  expectFileExists,
  expectFileNotExists,
  expectFileContains,
  expectFileNotContains,
  expectFileMatches,
  expectFileIsJson,
  expectJsonFileContains,
  expectJsonFileHasProperty,
  expectFileSize,
  expectFileNotEmpty,
  expectFilesExist,
  expectDirectoryContains,
} from './file-assertions.js';
