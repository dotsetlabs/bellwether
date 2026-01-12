/**
 * Documentation and reporting module.
 */

// Main generators
export { generateAgentsMd, generateJsonReport } from './generator.js';

// HTML reporter
export { generateHtmlReport } from './html-reporter.js';

// SARIF reporter
export {
  generateSarifReport,
  generateSarifFromDiff,
  generateSarifFromFindings,
} from './sarif-reporter.js';

// JUnit reporter
export {
  generateJunitReport,
  generateJunitFromDiff,
} from './junit-reporter.js';
