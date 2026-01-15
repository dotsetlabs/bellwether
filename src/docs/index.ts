/**
 * Documentation and reporting module.
 *
 * Supported output formats:
 * - AGENTS.md: Primary documentation format (industry standard)
 * - JSON: Machine-readable interview results
 */

// Main generators
export { generateAgentsMd, generateJsonReport } from './generator.js';
