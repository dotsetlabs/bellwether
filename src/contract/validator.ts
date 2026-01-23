/**
 * Contract-as-Code Validator.
 *
 * Validates MCP server behavior against defined contract expectations.
 * Contracts define expected tools, parameters, and output constraints,
 * enabling CI/CD integration and regression detection.
 */

import { readFileSync, existsSync } from 'fs';
import * as yaml from 'yaml';
import type { MCPTool, MCPToolCallResult } from '../transport/types.js';
import { CONTRACT_TESTING } from '../constants.js';
import type { ChangeSeverity } from '../baseline/types.js';

/**
 * A contract definition for an MCP server.
 */
export interface Contract {
  /** Contract schema version */
  version: string;
  /** Server metadata */
  server?: {
    /** Expected server name */
    name?: string;
    /** Minimum required version */
    minVersion?: string;
  };
  /** Tool contracts */
  tools: Record<string, ToolContract>;
  /** Resource contracts */
  resources?: Record<string, ResourceContract>;
}

/**
 * Contract for a single tool.
 */
export interface ToolContract {
  /** Whether this tool is required to exist */
  required?: boolean;
  /** Input parameter contracts */
  input?: Record<string, ParameterContract>;
  /** Output validation rules */
  output?: OutputContract;
  /** Expected behavior description */
  description?: string;
}

/**
 * Contract for a parameter.
 */
export interface ParameterContract {
  /** Whether this parameter is required */
  required?: boolean;
  /** Expected type (string, number, boolean, array, object) */
  type?: string;
  /** Expected format (date_iso8601, email, url, etc.) */
  format?: string;
  /** Minimum value (for numbers) */
  min?: number;
  /** Maximum value (for numbers) */
  max?: number;
  /** Allowed enum values */
  enum?: unknown[];
  /** Regex pattern the value must match */
  pattern?: string;
}

/**
 * Contract for tool output.
 */
export interface OutputContract {
  /** Paths that must be present in the output */
  must_contain?: OutputAssertion[];
  /** Paths that must not be present in the output */
  must_not_contain?: OutputAssertion[];
  /** Content type assertion */
  content_type?: 'json' | 'text' | 'markdown';
}

/**
 * A single output assertion.
 */
export interface OutputAssertion {
  /** JSONPath to check */
  path: string;
  /** Expected type at path */
  type?: string;
  /** Regex pattern the value must match */
  pattern?: string;
  /** Expected exact value */
  value?: unknown;
}

/**
 * Contract for a resource.
 */
export interface ResourceContract {
  /** Whether this resource is required */
  required?: boolean;
  /** Expected MIME type */
  mimeType?: string;
}

/**
 * A contract violation.
 */
export interface ContractViolation {
  /** Type of violation */
  type: ViolationType;
  /** Severity level */
  severity: ChangeSeverity;
  /** Tool name (if applicable) */
  tool?: string;
  /** Parameter name (if applicable) */
  parameter?: string;
  /** JSONPath (if applicable) */
  path?: string;
  /** Expected value/state */
  expected: string;
  /** Actual value/state */
  actual: string;
  /** Human-readable message */
  message: string;
}

/**
 * Types of contract violations.
 */
export type ViolationType =
  | 'missing_tool'
  | 'unexpected_tool'
  | 'missing_parameter'
  | 'unexpected_parameter'
  | 'type_mismatch'
  | 'format_mismatch'
  | 'constraint_violation'
  | 'output_assertion_failed'
  | 'missing_output_field'
  | 'unexpected_output_field'
  | 'content_type_mismatch';

/**
 * Result of contract validation.
 */
export interface ContractValidationResult {
  /** Whether the contract passed */
  passed: boolean;
  /** Overall severity of violations */
  severity: ChangeSeverity;
  /** All violations found */
  violations: ContractViolation[];
  /** Summary counts */
  summary: {
    totalViolations: number;
    breakingCount: number;
    warningCount: number;
    infoCount: number;
    toolsChecked: number;
    toolsPassed: number;
  };
  /** Validation mode used */
  mode: 'strict' | 'lenient' | 'report';
}

/**
 * Options for contract validation.
 */
export interface ContractValidationOptions {
  /** Validation mode */
  mode?: 'strict' | 'lenient' | 'report';
  /** Whether to validate output assertions (requires calling tools) */
  validateOutput?: boolean;
  /** Function to call tools for output validation */
  callTool?: (toolName: string, args: Record<string, unknown>) => Promise<MCPToolCallResult>;
  /** Whether to fail on unexpected tools */
  failOnUnexpectedTools?: boolean;
}

/**
 * Load a contract from a file.
 */
export function loadContract(filePath: string): Contract {
  if (!existsSync(filePath)) {
    throw new Error(`Contract file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');

  try {
    const parsed = yaml.parse(content) as Contract;

    // Validate schema version
    if (parsed.version && parsed.version !== CONTRACT_TESTING.SCHEMA_VERSION) {
      throw new Error(
        `Contract version ${parsed.version} is not supported. Expected version ${CONTRACT_TESTING.SCHEMA_VERSION}`
      );
    }

    // Set default version
    if (!parsed.version) {
      parsed.version = CONTRACT_TESTING.SCHEMA_VERSION;
    }

    // Ensure tools object exists
    if (!parsed.tools) {
      parsed.tools = {};
    }

    return parsed;
  } catch (error) {
    if (error instanceof yaml.YAMLError) {
      throw new Error(`Invalid YAML in contract file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Find a contract file in the given directory.
 */
export function findContractFile(directory: string): string | null {
  for (const filename of CONTRACT_TESTING.CONTRACT_FILENAMES) {
    const filePath = `${directory}/${filename}`;
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

/**
 * Validate an MCP server against a contract.
 */
export async function validateContract(
  contract: Contract,
  tools: MCPTool[],
  options: ContractValidationOptions = {}
): Promise<ContractValidationResult> {
  const mode = options.mode || 'strict';
  const violations: ContractViolation[] = [];

  // Build tool map for quick lookup
  const toolMap = new Map<string, MCPTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Check each contracted tool
  for (const [toolName, toolContract] of Object.entries(contract.tools)) {
    const tool = toolMap.get(toolName);

    // Check if required tool exists
    if (!tool) {
      if (toolContract.required !== false) {
        violations.push({
          type: 'missing_tool',
          severity: 'breaking',
          tool: toolName,
          expected: 'Tool should exist',
          actual: 'Tool not found',
          message: `Required tool "${toolName}" is missing from server`,
        });
      }
      continue;
    }

    // Validate input parameters
    if (toolContract.input) {
      const paramViolations = validateParameters(tool, toolContract.input);
      violations.push(...paramViolations);
    }

    // Validate output (if function provided)
    if (options.validateOutput && options.callTool && toolContract.output) {
      try {
        const result = await options.callTool(toolName, {});
        const outputViolations = validateOutput(toolName, result, toolContract.output);
        violations.push(...outputViolations);
      } catch (error) {
        violations.push({
          type: 'output_assertion_failed',
          severity: 'warning',
          tool: toolName,
          expected: 'Successful tool call',
          actual: `Error: ${error instanceof Error ? error.message : String(error)}`,
          message: `Failed to call tool "${toolName}" for output validation`,
        });
      }
    }
  }

  // Check for unexpected tools (if strict mode or option enabled)
  if (options.failOnUnexpectedTools || mode === 'strict') {
    for (const tool of tools) {
      if (!contract.tools[tool.name]) {
        violations.push({
          type: 'unexpected_tool',
          severity: 'info',
          tool: tool.name,
          expected: 'Tool should be in contract',
          actual: 'Tool not defined in contract',
          message: `Unexpected tool "${tool.name}" not defined in contract`,
        });
      }
    }
  }

  // Calculate summary
  const breakingCount = violations.filter(v => v.severity === 'breaking').length;
  const warningCount = violations.filter(v => v.severity === 'warning').length;
  const infoCount = violations.filter(v => v.severity === 'info').length;

  // Determine overall severity
  let severity: ChangeSeverity = 'none';
  if (breakingCount > 0) severity = 'breaking';
  else if (warningCount > 0) severity = 'warning';
  else if (infoCount > 0) severity = 'info';

  // Determine pass/fail based on mode
  let passed: boolean;
  switch (mode) {
    case 'strict':
      passed = violations.length === 0;
      break;
    case 'lenient':
      passed = breakingCount === 0;
      break;
    case 'report':
      passed = true;
      break;
  }

  return {
    passed,
    severity,
    violations,
    summary: {
      totalViolations: violations.length,
      breakingCount,
      warningCount,
      infoCount,
      toolsChecked: Object.keys(contract.tools).length,
      toolsPassed: Object.keys(contract.tools).length -
        violations.filter(v => v.type === 'missing_tool').length,
    },
    mode,
  };
}

/**
 * Validate tool parameters against contract.
 */
function validateParameters(
  tool: MCPTool,
  paramContracts: Record<string, ParameterContract>
): ContractViolation[] {
  const violations: ContractViolation[] = [];
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  } | undefined;

  const actualProperties = schema?.properties || {};
  const actualRequired = schema?.required || [];

  // Check contracted parameters
  for (const [paramName, paramContract] of Object.entries(paramContracts)) {
    const actualParam = actualProperties[paramName] as Record<string, unknown> | undefined;

    // Check if required parameter exists
    if (!actualParam && paramContract.required !== false) {
      violations.push({
        type: 'missing_parameter',
        severity: 'breaking',
        tool: tool.name,
        parameter: paramName,
        expected: 'Parameter should exist',
        actual: 'Parameter not found',
        message: `Required parameter "${paramName}" is missing from tool "${tool.name}"`,
      });
      continue;
    }

    if (!actualParam) continue;

    // Check type
    if (paramContract.type) {
      const actualType = actualParam.type as string | undefined;
      if (actualType !== paramContract.type) {
        violations.push({
          type: 'type_mismatch',
          severity: 'breaking',
          tool: tool.name,
          parameter: paramName,
          expected: paramContract.type,
          actual: actualType || 'unknown',
          message: `Parameter "${paramName}" type mismatch: expected ${paramContract.type}, got ${actualType}`,
        });
      }
    }

    // Check format
    if (paramContract.format) {
      const actualFormat = actualParam.format as string | undefined;
      if (actualFormat !== paramContract.format) {
        violations.push({
          type: 'format_mismatch',
          severity: 'warning',
          tool: tool.name,
          parameter: paramName,
          expected: paramContract.format,
          actual: actualFormat || 'none',
          message: `Parameter "${paramName}" format mismatch: expected ${paramContract.format}, got ${actualFormat || 'none'}`,
        });
      }
    }

    // Check required status
    if (paramContract.required === true && !actualRequired.includes(paramName)) {
      violations.push({
        type: 'constraint_violation',
        severity: 'warning',
        tool: tool.name,
        parameter: paramName,
        expected: 'Parameter should be required',
        actual: 'Parameter is optional',
        message: `Parameter "${paramName}" should be required in tool "${tool.name}"`,
      });
    }

    // Check enum
    if (paramContract.enum) {
      const actualEnum = actualParam.enum as unknown[] | undefined;
      if (actualEnum) {
        for (const value of paramContract.enum) {
          if (!actualEnum.includes(value)) {
            violations.push({
              type: 'constraint_violation',
              severity: 'warning',
              tool: tool.name,
              parameter: paramName,
              expected: `Enum should contain ${String(value)}`,
              actual: `Enum values: ${actualEnum.join(', ')}`,
              message: `Parameter "${paramName}" enum missing expected value: ${String(value)}`,
            });
          }
        }
      }
    }

    // Check min/max
    if (paramContract.min !== undefined) {
      const actualMin = actualParam.minimum as number | undefined;
      if (actualMin === undefined || actualMin > paramContract.min) {
        violations.push({
          type: 'constraint_violation',
          severity: 'warning',
          tool: tool.name,
          parameter: paramName,
          expected: `minimum <= ${paramContract.min}`,
          actual: `minimum = ${actualMin ?? 'none'}`,
          message: `Parameter "${paramName}" minimum constraint mismatch`,
        });
      }
    }

    if (paramContract.max !== undefined) {
      const actualMax = actualParam.maximum as number | undefined;
      if (actualMax === undefined || actualMax < paramContract.max) {
        violations.push({
          type: 'constraint_violation',
          severity: 'warning',
          tool: tool.name,
          parameter: paramName,
          expected: `maximum >= ${paramContract.max}`,
          actual: `maximum = ${actualMax ?? 'none'}`,
          message: `Parameter "${paramName}" maximum constraint mismatch`,
        });
      }
    }
  }

  return violations;
}

/**
 * Validate tool output against contract.
 */
function validateOutput(
  toolName: string,
  result: MCPToolCallResult,
  outputContract: OutputContract
): ContractViolation[] {
  const violations: ContractViolation[] = [];

  // Extract text content
  const textContent = result.content.find(c => c.type === 'text');
  const raw = textContent && 'text' in textContent ? String(textContent.text) : '';

  // Check content type
  if (outputContract.content_type) {
    const actualType = detectContentType(raw);
    if (actualType !== outputContract.content_type) {
      violations.push({
        type: 'content_type_mismatch',
        severity: 'warning',
        tool: toolName,
        expected: outputContract.content_type,
        actual: actualType,
        message: `Output content type mismatch: expected ${outputContract.content_type}, got ${actualType}`,
      });
    }
  }

  // Parse JSON if applicable
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON - can only check content type
    if (outputContract.must_contain || outputContract.must_not_contain) {
      violations.push({
        type: 'output_assertion_failed',
        severity: 'warning',
        tool: toolName,
        expected: 'JSON output for path assertions',
        actual: 'Non-JSON output',
        message: `Cannot evaluate JSONPath assertions on non-JSON output`,
      });
    }
    return violations;
  }

  // Check must_contain assertions
  if (outputContract.must_contain) {
    for (const assertion of outputContract.must_contain) {
      const value = getValueAtPath(parsed, assertion.path);

      if (value === undefined) {
        violations.push({
          type: 'missing_output_field',
          severity: 'warning',
          tool: toolName,
          path: assertion.path,
          expected: 'Path should exist',
          actual: 'Path not found',
          message: `Required output path "${assertion.path}" not found in tool "${toolName}" response`,
        });
        continue;
      }

      // Check type
      if (assertion.type) {
        const actualType = getValueType(value);
        if (actualType !== assertion.type) {
          violations.push({
            type: 'output_assertion_failed',
            severity: 'warning',
            tool: toolName,
            path: assertion.path,
            expected: assertion.type,
            actual: actualType,
            message: `Output type mismatch at "${assertion.path}": expected ${assertion.type}, got ${actualType}`,
          });
        }
      }

      // Check pattern
      if (assertion.pattern && typeof value === 'string') {
        const regex = new RegExp(assertion.pattern);
        if (!regex.test(value)) {
          violations.push({
            type: 'output_assertion_failed',
            severity: 'warning',
            tool: toolName,
            path: assertion.path,
            expected: `matches /${assertion.pattern}/`,
            actual: truncate(value, 50),
            message: `Output at "${assertion.path}" doesn't match pattern: ${assertion.pattern}`,
          });
        }
      }

      // Check exact value
      if (assertion.value !== undefined && value !== assertion.value) {
        violations.push({
          type: 'output_assertion_failed',
          severity: 'warning',
          tool: toolName,
          path: assertion.path,
          expected: String(assertion.value),
          actual: String(value),
          message: `Output value mismatch at "${assertion.path}"`,
        });
      }
    }
  }

  // Check must_not_contain assertions
  if (outputContract.must_not_contain) {
    for (const assertion of outputContract.must_not_contain) {
      const value = getValueAtPath(parsed, assertion.path);

      if (value !== undefined) {
        violations.push({
          type: 'unexpected_output_field',
          severity: 'info',
          tool: toolName,
          path: assertion.path,
          expected: 'Path should not exist',
          actual: `Path exists with value: ${truncate(String(value), 50)}`,
          message: `Forbidden output path "${assertion.path}" found in tool "${toolName}" response`,
        });
      }
    }
  }

  return violations;
}

/**
 * Get value at a JSONPath-like path.
 * Supports simple paths like $.field.nested[0].value
 */
function getValueAtPath(obj: unknown, path: string): unknown {
  // Remove leading $. if present
  const cleanPath = path.replace(/^\$\.?/, '');
  if (!cleanPath) return obj;

  const segments = cleanPath.split(/\.|\[|\]/).filter(Boolean);
  let current = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;

    if (typeof current !== 'object') return undefined;

    // Handle array index
    const index = parseInt(segment, 10);
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }

  return current;
}

/**
 * Get the type name of a value.
 */
function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Detect content type from raw output.
 */
function detectContentType(raw: string): 'json' | 'markdown' | 'text' {
  const trimmed = raw.trim();

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not valid JSON
    }
  }

  if (/^#|^\*{1,3}[^*]|\[.*\]\(.*\)|^```/.test(trimmed)) {
    return 'markdown';
  }

  return 'text';
}

/**
 * Truncate a string for display.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Generate a contract from current server state.
 */
export function generateContract(
  tools: MCPTool[],
  serverName?: string
): Contract {
  const contract: Contract = {
    version: CONTRACT_TESTING.SCHEMA_VERSION,
    server: serverName ? { name: serverName } : undefined,
    tools: {},
  };

  for (const tool of tools) {
    const schema = tool.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
    } | undefined;

    const inputContracts: Record<string, ParameterContract> = {};

    if (schema?.properties) {
      for (const [paramName, paramSchema] of Object.entries(schema.properties)) {
        const param = paramSchema as Record<string, unknown>;
        const paramContract: ParameterContract = {
          required: schema.required?.includes(paramName),
        };

        if (param.type) paramContract.type = String(param.type);
        if (param.format) paramContract.format = String(param.format);
        if (param.minimum !== undefined) paramContract.min = Number(param.minimum);
        if (param.maximum !== undefined) paramContract.max = Number(param.maximum);
        if (Array.isArray(param.enum)) paramContract.enum = param.enum;

        inputContracts[paramName] = paramContract;
      }
    }

    contract.tools[tool.name] = {
      required: true,
      input: Object.keys(inputContracts).length > 0 ? inputContracts : undefined,
      description: tool.description,
    };
  }

  return contract;
}

/**
 * Generate contract YAML from contract object.
 */
export function generateContractYaml(contract: Contract): string {
  return yaml.stringify(contract, {
    indent: 2,
    lineWidth: 100,
  });
}

/**
 * Generate markdown report for contract validation.
 */
export function generateContractValidationMarkdown(result: ContractValidationResult): string {
  const lines: string[] = [];
  const statusIcon = result.passed ? '✓' : '✗';
  const statusText = result.passed ? 'PASSED' : 'FAILED';

  lines.push('## Contract Validation');
  lines.push('');
  lines.push(`**Status: ${statusIcon} ${statusText}** (${result.mode} mode)`);
  lines.push('');

  // Summary table
  lines.push('| Metric | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Tools Checked | ${result.summary.toolsChecked} |`);
  lines.push(`| Tools Passed | ${result.summary.toolsPassed} |`);
  lines.push(`| Total Violations | ${result.summary.totalViolations} |`);
  if (result.summary.breakingCount > 0) {
    lines.push(`| Breaking | ${result.summary.breakingCount} |`);
  }
  if (result.summary.warningCount > 0) {
    lines.push(`| Warnings | ${result.summary.warningCount} |`);
  }
  if (result.summary.infoCount > 0) {
    lines.push(`| Info | ${result.summary.infoCount} |`);
  }
  lines.push('');

  // Violation details
  if (result.violations.length > 0) {
    lines.push('### Violations');
    lines.push('');

    // Group by severity
    const bySeverity: Record<ChangeSeverity, ContractViolation[]> = {
      breaking: [],
      warning: [],
      info: [],
      none: [],
    };

    for (const v of result.violations) {
      bySeverity[v.severity].push(v);
    }

    for (const severity of ['breaking', 'warning', 'info'] as ChangeSeverity[]) {
      const violations = bySeverity[severity];
      if (violations.length === 0) continue;

      const icon = severity === 'breaking' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`#### ${icon} ${severity.charAt(0).toUpperCase() + severity.slice(1)} (${violations.length})`);
      lines.push('');

      for (const v of violations.slice(0, CONTRACT_TESTING.MAX_VALIDATION_ERRORS)) {
        const location = [v.tool, v.parameter, v.path].filter(Boolean).join(' › ');
        lines.push(`- **${location || v.type}**: ${v.message}`);
      }

      if (violations.length > CONTRACT_TESTING.MAX_VALIDATION_ERRORS) {
        lines.push(`- ... and ${violations.length - CONTRACT_TESTING.MAX_VALIDATION_ERRORS} more`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
