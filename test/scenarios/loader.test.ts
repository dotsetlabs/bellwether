import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';
import {
  loadScenariosFromFile,
  tryLoadDefaultScenarios,
  generateSampleScenariosYaml,
  DEFAULT_SCENARIOS_FILE,
} from '../../src/scenarios/loader.js';

describe('scenarios/loader', () => {
  const testDir = join(process.cwd(), 'test-scenarios-tmp');
  const testFile = join(testDir, 'test-scenarios.yaml');

  beforeEach(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
    if (existsSync(join(testDir, DEFAULT_SCENARIOS_FILE))) {
      unlinkSync(join(testDir, DEFAULT_SCENARIOS_FILE));
    }
    if (existsSync(testDir)) {
      rmdirSync(testDir);
    }
  });

  describe('loadScenariosFromFile', () => {
    it('should load a valid scenarios file', () => {
      const yaml = `
version: "1"
description: Test scenarios
scenarios:
  - tool: test_tool
    description: Test scenario
    category: happy_path
    args:
      param: value
`;
      writeFileSync(testFile, yaml);

      const result = loadScenariosFromFile(testFile);

      expect(result.source).toBe(testFile);
      expect(result.version).toBe('1');
      expect(result.description).toBe('Test scenarios');
      expect(result.toolScenarios).toHaveLength(1);
      expect(result.toolScenarios[0].tool).toBe('test_tool');
      expect(result.toolScenarios[0].description).toBe('Test scenario');
      expect(result.toolScenarios[0].category).toBe('happy_path');
      expect(result.toolScenarios[0].args).toEqual({ param: 'value' });
    });

    it('should load scenarios with assertions', () => {
      const yaml = `
scenarios:
  - tool: test_tool
    args: {}
    assertions:
      - path: result.value
        condition: exists
      - path: result.count
        condition: equals
        value: 5
`;
      writeFileSync(testFile, yaml);

      const result = loadScenariosFromFile(testFile);

      expect(result.toolScenarios[0].assertions).toHaveLength(2);
      expect(result.toolScenarios[0].assertions![0].path).toBe('result.value');
      expect(result.toolScenarios[0].assertions![0].condition).toBe('exists');
      expect(result.toolScenarios[0].assertions![1].condition).toBe('equals');
      expect(result.toolScenarios[0].assertions![1].value).toBe(5);
    });

    it('should load prompt scenarios', () => {
      const yaml = `
prompts:
  - prompt: test_prompt
    description: Test prompt scenario
    args:
      text: "Hello"
    assertions:
      - path: messages
        condition: exists
`;
      writeFileSync(testFile, yaml);

      const result = loadScenariosFromFile(testFile);

      expect(result.promptScenarios).toHaveLength(1);
      expect(result.promptScenarios[0].prompt).toBe('test_prompt');
      expect(result.promptScenarios[0].args).toEqual({ text: 'Hello' });
    });

    it('should handle global tags', () => {
      const yaml = `
tags:
  - global
scenarios:
  - tool: test_tool
    args: {}
    tags:
      - local
`;
      writeFileSync(testFile, yaml);

      const result = loadScenariosFromFile(testFile);

      expect(result.toolScenarios[0].tags).toEqual(['global', 'local']);
    });

    it('should default category to happy_path', () => {
      const yaml = `
scenarios:
  - tool: test_tool
    args: {}
`;
      writeFileSync(testFile, yaml);

      const result = loadScenariosFromFile(testFile);

      expect(result.toolScenarios[0].category).toBe('happy_path');
    });

    it('should handle skip flag', () => {
      const yaml = `
scenarios:
  - tool: test_tool
    args: {}
    skip: true
`;
      writeFileSync(testFile, yaml);

      const result = loadScenariosFromFile(testFile);

      expect(result.toolScenarios[0].skip).toBe(true);
    });

    it('should throw on missing tool', () => {
      const yaml = `
scenarios:
  - description: Missing tool
    args: {}
`;
      writeFileSync(testFile, yaml);

      expect(() => loadScenariosFromFile(testFile)).toThrow('missing required field: tool');
    });

    it('should throw on invalid category', () => {
      const yaml = `
scenarios:
  - tool: test_tool
    category: invalid_category
    args: {}
`;
      writeFileSync(testFile, yaml);

      expect(() => loadScenariosFromFile(testFile)).toThrow('invalid category');
    });

    it('should throw on missing assertion path', () => {
      const yaml = `
scenarios:
  - tool: test_tool
    args: {}
    assertions:
      - condition: exists
`;
      writeFileSync(testFile, yaml);

      expect(() => loadScenariosFromFile(testFile)).toThrow('missing required field "path"');
    });

    it('should throw on invalid assertion condition', () => {
      const yaml = `
scenarios:
  - tool: test_tool
    args: {}
    assertions:
      - path: result
        condition: invalid
`;
      writeFileSync(testFile, yaml);

      expect(() => loadScenariosFromFile(testFile)).toThrow('invalid condition');
    });

    it('should throw when equals condition missing value', () => {
      const yaml = `
scenarios:
  - tool: test_tool
    args: {}
    assertions:
      - path: result
        condition: equals
`;
      writeFileSync(testFile, yaml);

      expect(() => loadScenariosFromFile(testFile)).toThrow('requires a "value" field');
    });

    it('should throw on file not found', () => {
      expect(() => loadScenariosFromFile('/nonexistent/file.yaml')).toThrow('not found');
    });

    it('should validate prompt args are strings', () => {
      const yaml = `
prompts:
  - prompt: test_prompt
    args:
      count: 5
`;
      writeFileSync(testFile, yaml);

      expect(() => loadScenariosFromFile(testFile)).toThrow('must be a string');
    });
  });

  describe('tryLoadDefaultScenarios', () => {
    it('should return null if default file does not exist', () => {
      const result = tryLoadDefaultScenarios(testDir);
      expect(result).toBeNull();
    });

    it('should load default file if it exists', () => {
      const yaml = `
scenarios:
  - tool: default_tool
    args: {}
`;
      writeFileSync(join(testDir, DEFAULT_SCENARIOS_FILE), yaml);

      const result = tryLoadDefaultScenarios(testDir);

      expect(result).not.toBeNull();
      expect(result!.toolScenarios).toHaveLength(1);
      expect(result!.toolScenarios[0].tool).toBe('default_tool');
    });
  });

  describe('generateSampleScenariosYaml', () => {
    it('should generate valid YAML', () => {
      const yaml = generateSampleScenariosYaml();

      expect(yaml).toContain('version:');
      expect(yaml).toContain('scenarios:');
      expect(yaml).toContain('prompts:');
      expect(yaml).toContain('assertions:');
    });

    it('should include documentation comments', () => {
      const yaml = generateSampleScenariosYaml();

      expect(yaml).toContain('# Bellwether Test Scenarios');
      expect(yaml).toContain('# Assertion conditions:');
      expect(yaml).toContain('# Categories:');
    });
  });

  describe('DEFAULT_SCENARIOS_FILE', () => {
    it('should be bellwether-tests.yaml', () => {
      expect(DEFAULT_SCENARIOS_FILE).toBe('bellwether-tests.yaml');
    });
  });
});
