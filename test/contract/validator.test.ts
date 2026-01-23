/**
 * Tests for Contract-as-Code Validator.
 */

import { describe, it, expect } from 'vitest';
import {
  loadContract,
  validateContract,
  generateContract,
  generateContractYaml,
  generateContractValidationMarkdown,
  type Contract,
} from '../../src/contract/index.js';
import type { MCPTool } from '../../src/transport/types.js';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Contract Validator', () => {
  // Temporary directory for test files
  const testDir = join(tmpdir(), 'bellwether-contract-tests');

  // Helper to create a temp file
  function createTempFile(filename: string, content: string): string {
    try {
      mkdirSync(testDir, { recursive: true });
    } catch {
      // Directory may already exist
    }
    const path = join(testDir, filename);
    writeFileSync(path, content);
    return path;
  }

  // Cleanup after tests
  afterAll(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Cleanup failure is okay
    }
  });

  describe('loadContract', () => {
    it('should load a valid YAML contract', () => {
      const yaml = `
version: "1"
tools:
  create_user:
    required: true
    input:
      username:
        type: string
        required: true
`;
      const path = createTempFile('valid.yaml', yaml);
      const contract = loadContract(path);

      expect(contract.version).toBe('1');
      expect(contract.tools.create_user).toBeDefined();
      expect(contract.tools.create_user.required).toBe(true);
    });

    it('should throw for non-existent file', () => {
      expect(() => loadContract('/nonexistent/path.yaml')).toThrow('not found');
    });

    it('should throw for unsupported version', () => {
      const yaml = `
version: "99.0"
tools:
  test_tool:
    required: true
`;
      const path = createTempFile('bad-version.yaml', yaml);
      expect(() => loadContract(path)).toThrow('not supported');
    });

    it('should set default version if not specified', () => {
      const yaml = `
tools:
  test_tool:
    required: true
`;
      const path = createTempFile('no-version.yaml', yaml);
      const contract = loadContract(path);

      expect(contract.version).toBeDefined();
    });
  });

  describe('validateContract', () => {
    it('should pass for matching tools', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          create_user: {
            required: true,
            input: {
              username: { type: 'string', required: true },
            },
          },
        },
      };

      const tools: MCPTool[] = [
        {
          name: 'create_user',
          description: 'Creates a user',
          inputSchema: {
            type: 'object',
            properties: {
              username: { type: 'string' },
            },
            required: ['username'],
          },
        },
      ];

      const result = await validateContract(contract, tools);

      expect(result.passed).toBe(true);
      expect(result.violations.filter(v => v.severity === 'breaking')).toHaveLength(0);
    });

    it('should fail for missing required tool', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          required_tool: {
            required: true,
          },
        },
      };

      const tools: MCPTool[] = [
        { name: 'other_tool', description: 'Other', inputSchema: {} },
      ];

      const result = await validateContract(contract, tools);

      expect(result.passed).toBe(false);
      expect(result.violations.some(v => v.type === 'missing_tool')).toBe(true);
    });

    it('should not fail for missing optional tool', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          optional_tool: {
            required: false,
          },
        },
      };

      const tools: MCPTool[] = [];

      const result = await validateContract(contract, tools, { mode: 'lenient' });

      expect(result.violations.filter(v => v.type === 'missing_tool')).toHaveLength(0);
    });

    it('should detect missing required parameter', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          test_tool: {
            input: {
              required_param: { required: true },
            },
          },
        },
      };

      const tools: MCPTool[] = [
        {
          name: 'test_tool',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];

      const result = await validateContract(contract, tools);

      expect(result.violations.some(v =>
        v.type === 'missing_parameter' && v.parameter === 'required_param'
      )).toBe(true);
    });

    it('should detect type mismatch', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          test_tool: {
            input: {
              count: { type: 'integer' },
            },
          },
        },
      };

      const tools: MCPTool[] = [
        {
          name: 'test_tool',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'string' },
            },
          },
        },
      ];

      const result = await validateContract(contract, tools);

      expect(result.violations.some(v => v.type === 'type_mismatch')).toBe(true);
    });

    it('should detect format mismatch', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          test_tool: {
            input: {
              email: { type: 'string', format: 'email' },
            },
          },
        },
      };

      const tools: MCPTool[] = [
        {
          name: 'test_tool',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string' },
            },
          },
        },
      ];

      const result = await validateContract(contract, tools);

      expect(result.violations.some(v => v.type === 'format_mismatch')).toBe(true);
    });

    it('should detect missing enum values', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          test_tool: {
            input: {
              status: { enum: ['active', 'inactive', 'pending'] },
            },
          },
        },
      };

      const tools: MCPTool[] = [
        {
          name: 'test_tool',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['active', 'inactive'] },
            },
          },
        },
      ];

      const result = await validateContract(contract, tools);

      expect(result.violations.some(v =>
        v.type === 'constraint_violation' && v.message.includes('pending')
      )).toBe(true);
    });

    it('should respect strict mode', async () => {
      const contract: Contract = {
        version: '1',
        tools: {},
      };

      const tools: MCPTool[] = [
        { name: 'unexpected_tool', description: 'Unexpected', inputSchema: {} },
      ];

      const result = await validateContract(contract, tools, {
        mode: 'strict',
        failOnUnexpectedTools: true,
      });

      expect(result.violations.some(v => v.type === 'unexpected_tool')).toBe(true);
    });

    it('should respect lenient mode', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          test_tool: {
            input: {
              param: { format: 'email' },
            },
          },
        },
      };

      const tools: MCPTool[] = [
        {
          name: 'test_tool',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: {
              param: { type: 'string' },
            },
          },
        },
      ];

      const result = await validateContract(contract, tools, { mode: 'lenient' });

      // Lenient mode passes with only warning violations
      expect(result.passed).toBe(true);
    });

    it('should calculate summary correctly', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          tool1: { required: true },
          tool2: { required: true },
          tool3: { required: true },
        },
      };

      const tools: MCPTool[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: {} },
        { name: 'tool2', description: 'Tool 2', inputSchema: {} },
      ];

      const result = await validateContract(contract, tools);

      expect(result.summary.toolsChecked).toBe(3);
      expect(result.summary.toolsPassed).toBe(2);
      expect(result.summary.totalViolations).toBeGreaterThan(0);
    });
  });

  describe('generateContract', () => {
    it('should generate contract from tools', () => {
      const tools: MCPTool[] = [
        {
          name: 'create_user',
          description: 'Creates a new user',
          inputSchema: {
            type: 'object',
            properties: {
              username: { type: 'string' },
              age: { type: 'integer', minimum: 0, maximum: 150 },
              role: { type: 'string', enum: ['admin', 'user'] },
            },
            required: ['username'],
          },
        },
      ];

      const contract = generateContract(tools, 'Test Server');

      expect(contract.version).toBeDefined();
      expect(contract.server?.name).toBe('Test Server');
      expect(contract.tools.create_user).toBeDefined();
      expect(contract.tools.create_user.required).toBe(true);
      expect(contract.tools.create_user.input?.username?.type).toBe('string');
      expect(contract.tools.create_user.input?.username?.required).toBe(true);
      expect(contract.tools.create_user.input?.age?.min).toBe(0);
      expect(contract.tools.create_user.input?.age?.max).toBe(150);
      expect(contract.tools.create_user.input?.role?.enum).toEqual(['admin', 'user']);
    });

    it('should handle tools with no parameters', () => {
      const tools: MCPTool[] = [
        {
          name: 'get_status',
          description: 'Gets system status',
          inputSchema: {},
        },
      ];

      const contract = generateContract(tools);

      expect(contract.tools.get_status).toBeDefined();
      expect(contract.tools.get_status.input).toBeUndefined();
    });
  });

  describe('generateContractYaml', () => {
    it('should generate valid YAML', () => {
      const contract: Contract = {
        version: '1',
        tools: {
          test_tool: {
            required: true,
            input: {
              param: { type: 'string' },
            },
          },
        },
      };

      const yaml = generateContractYaml(contract);

      expect(yaml).toContain('version:');
      expect(yaml).toContain('test_tool');
      expect(yaml).toContain('required: true');
    });
  });

  describe('generateContractValidationMarkdown', () => {
    it('should generate markdown for passed validation', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          test_tool: { required: true },
        },
      };

      const tools: MCPTool[] = [
        { name: 'test_tool', description: 'Test', inputSchema: {} },
      ];

      const result = await validateContract(contract, tools);
      const markdown = generateContractValidationMarkdown(result);

      expect(markdown).toContain('## Contract Validation');
      expect(markdown).toContain('PASSED');
      expect(markdown).toContain('| Metric | Count |');
    });

    it('should generate markdown for failed validation', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          missing_tool: { required: true },
        },
      };

      const tools: MCPTool[] = [];

      const result = await validateContract(contract, tools);
      const markdown = generateContractValidationMarkdown(result);

      expect(markdown).toContain('FAILED');
      expect(markdown).toContain('### Violations');
    });

    it('should group violations by severity', async () => {
      const contract: Contract = {
        version: '1',
        tools: {
          tool1: {
            required: true,
            input: {
              param: { type: 'integer', format: 'special' },
            },
          },
        },
      };

      const tools: MCPTool[] = [
        {
          name: 'tool1',
          description: 'Test',
          inputSchema: {
            type: 'object',
            properties: {
              param: { type: 'string' },
            },
          },
        },
      ];

      const result = await validateContract(contract, tools);
      const markdown = generateContractValidationMarkdown(result);

      // Should have sections for different severity levels
      if (result.summary.breakingCount > 0) {
        expect(markdown).toContain('Breaking');
      }
      if (result.summary.warningCount > 0) {
        expect(markdown).toContain('Warning');
      }
    });
  });
});
