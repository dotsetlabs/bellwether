/**
 * Documentation and reporting module.
 *
 * Supported output formats:
 * - AGENTS.md: Primary documentation format (industry standard)
 * - JSON: Machine-readable interview results
 * - SARIF: GitHub Code Scanning integration
 * - JUnit: CI/CD test result integration
 */

// Main generators
export { generateAgentsMd, generateJsonReport } from './generator.js';

// SARIF reporter (GitHub Code Scanning)
export {
  generateSarifReport,
  generateSarifFromDiff,
  generateSarifFromFindings,
} from './sarif-reporter.js';

// JUnit reporter (CI/CD integration)
export {
  generateJunitReport,
  generateJunitFromDiff,
} from './junit-reporter.js';
