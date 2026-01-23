/**
 * Contract module - contract-as-code validation.
 */

export type {
  Contract,
  ToolContract,
  ParameterContract,
  OutputContract,
  OutputAssertion,
  ResourceContract,
  ContractViolation,
  ViolationType,
  ContractValidationResult,
  ContractValidationOptions,
} from './validator.js';

export {
  loadContract,
  findContractFile,
  validateContract,
  generateContract,
  generateContractYaml,
  generateContractValidationMarkdown,
} from './validator.js';
