/**
 * Documentation and reporting module.
 *
 * Supported output formats:
 * - CONTRACT.md: Check command output (schema-focused)
 * - AGENTS.md: Explore command output (behavior-focused, LLM-powered)
 * - JSON: Machine-readable interview results
 */

// Main generators
export { generateAgentsMd, generateContractMd, generateJsonReport } from './generator.js';
