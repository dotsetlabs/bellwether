/**
 * Tests for the persona system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadPersonas,
  resolvePersona,
  loadPersonaFromFile,
  generateSamplePersonaYaml,
} from '../../src/persona/loader.js';
import {
  BUILTIN_PERSONAS,
  isBuiltinPersona,
  getBuiltinPersona,
  getBuiltinPersonaIds,
  DEFAULT_PERSONA,
  technicalWriterPersona,
  securityTesterPersona,
  qaEngineerPersona,
  noviceUserPersona,
} from '../../src/persona/builtins.js';
import type { Persona } from '../../src/persona/types.js';

describe('Persona System', () => {
  describe('Built-in Personas', () => {
    it('should have four built-in personas', () => {
      const ids = getBuiltinPersonaIds();
      expect(ids).toHaveLength(4);
      expect(ids).toContain('technical_writer');
      expect(ids).toContain('security_tester');
      expect(ids).toContain('qa_engineer');
      expect(ids).toContain('novice_user');
    });

    it('should identify built-in persona IDs correctly', () => {
      expect(isBuiltinPersona('technical_writer')).toBe(true);
      expect(isBuiltinPersona('security_tester')).toBe(true);
      expect(isBuiltinPersona('qa_engineer')).toBe(true);
      expect(isBuiltinPersona('novice_user')).toBe(true);
      expect(isBuiltinPersona('unknown_persona')).toBe(false);
    });

    it('should retrieve built-in personas by ID', () => {
      expect(getBuiltinPersona('technical_writer')).toBe(technicalWriterPersona);
      expect(getBuiltinPersona('security_tester')).toBe(securityTesterPersona);
      expect(getBuiltinPersona('qa_engineer')).toBe(qaEngineerPersona);
      expect(getBuiltinPersona('novice_user')).toBe(noviceUserPersona);
    });

    it('should throw for unknown built-in persona ID', () => {
      expect(() => getBuiltinPersona('unknown' as any)).toThrow('Unknown built-in persona');
    });

    it('should have DEFAULT_PERSONA as technical_writer', () => {
      expect(DEFAULT_PERSONA).toBe(technicalWriterPersona);
    });

    describe('Technical Writer Persona', () => {
      it('should have correct properties', () => {
        expect(technicalWriterPersona.id).toBe('technical_writer');
        expect(technicalWriterPersona.name).toBe('Technical Writer');
        expect(technicalWriterPersona.builtin).toBe(true);
        expect(technicalWriterPersona.systemPrompt).toContain('documentation');
      });

      it('should have balanced question bias', () => {
        const bias = technicalWriterPersona.questionBias;
        expect(bias.happyPath).toBe(0.5);
        expect(bias.edgeCase).toBe(0.2);
        expect(bias.errorHandling).toBe(0.2);
        expect(bias.boundary).toBe(0.1);
        expect(bias.security).toBeUndefined();
      });

      it('should have correct categories', () => {
        expect(technicalWriterPersona.categories).toContain('happy_path');
        expect(technicalWriterPersona.categories).toContain('edge_case');
        expect(technicalWriterPersona.categories).toContain('error_handling');
      });
    });

    describe('Security Tester Persona', () => {
      it('should have correct properties', () => {
        expect(securityTesterPersona.id).toBe('security_tester');
        expect(securityTesterPersona.name).toBe('Security Tester');
        expect(securityTesterPersona.builtin).toBe(true);
        expect(securityTesterPersona.systemPrompt).toContain('security');
      });

      it('should have security-focused question bias', () => {
        const bias = securityTesterPersona.questionBias;
        expect(bias.security).toBe(0.3);
        expect(bias.happyPath).toBe(0.1);
      });

      it('should include security category', () => {
        expect(securityTesterPersona.categories).toContain('security');
      });

      it('should have additional context with attack patterns', () => {
        expect(securityTesterPersona.additionalContext).toContain('Path inputs');
        expect(securityTesterPersona.additionalContext).toContain('../');
      });
    });

    describe('QA Engineer Persona', () => {
      it('should have correct properties', () => {
        expect(qaEngineerPersona.id).toBe('qa_engineer');
        expect(qaEngineerPersona.name).toBe('QA Engineer');
        expect(qaEngineerPersona.builtin).toBe(true);
      });

      it('should focus on edge cases and error handling', () => {
        const bias = qaEngineerPersona.questionBias;
        expect(bias.edgeCase).toBe(0.35);
        expect(bias.errorHandling).toBe(0.35);
      });
    });

    describe('Novice User Persona', () => {
      it('should have correct properties', () => {
        expect(noviceUserPersona.id).toBe('novice_user');
        expect(noviceUserPersona.name).toBe('Novice User');
        expect(noviceUserPersona.builtin).toBe(true);
      });

      it('should focus on error handling', () => {
        const bias = noviceUserPersona.questionBias;
        expect(bias.errorHandling).toBe(0.5);
      });
    });
  });

  describe('Persona Loader', () => {
    let tempDir: string;
    let tempFile: string;

    beforeEach(() => {
      tempDir = tmpdir();
      tempFile = join(tempDir, `test-persona-${Date.now()}.yaml`);
    });

    afterEach(() => {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    });

    describe('loadPersonas', () => {
      it('should return default persona when no options provided', () => {
        const personas = loadPersonas();
        expect(personas).toHaveLength(1);
        expect(personas[0]).toBe(DEFAULT_PERSONA);
      });

      it('should load single built-in persona by ID', () => {
        const personas = loadPersonas({ personas: 'security_tester' });
        expect(personas).toHaveLength(1);
        expect(personas[0].id).toBe('security_tester');
      });

      it('should load multiple built-in personas', () => {
        const personas = loadPersonas({ personas: 'security_tester,qa_engineer' });
        expect(personas).toHaveLength(2);
        expect(personas[0].id).toBe('security_tester');
        expect(personas[1].id).toBe('qa_engineer');
      });

      it('should load personas from array', () => {
        const personas = loadPersonas({ personas: ['technical_writer', 'novice_user'] });
        expect(personas).toHaveLength(2);
        expect(personas[0].id).toBe('technical_writer');
        expect(personas[1].id).toBe('novice_user');
      });

      it('should deduplicate personas', () => {
        const personas = loadPersonas({ personas: 'security_tester,security_tester' });
        expect(personas).toHaveLength(1);
      });

      it('should load custom persona from file', () => {
        const yaml = `
id: custom_test
name: Custom Test
systemPrompt: Test prompt
`;
        writeFileSync(tempFile, yaml);

        const personas = loadPersonas({ personaFile: tempFile });
        expect(personas).toHaveLength(1);
        expect(personas[0].id).toBe('custom_test');
        expect(personas[0].name).toBe('Custom Test');
      });
    });

    describe('resolvePersona', () => {
      it('should resolve built-in persona by ID', () => {
        const persona = resolvePersona('technical_writer');
        expect(persona).toBe(technicalWriterPersona);
      });

      it('should resolve persona by alias', () => {
        expect(resolvePersona('writer').id).toBe('technical_writer');
        expect(resolvePersona('security').id).toBe('security_tester');
        expect(resolvePersona('qa').id).toBe('qa_engineer');
        expect(resolvePersona('novice').id).toBe('novice_user');
        expect(resolvePersona('beginner').id).toBe('novice_user');
      });

      it('should resolve persona from file path', () => {
        const yaml = `
id: file_persona
name: File Persona
systemPrompt: Prompt from file
`;
        writeFileSync(tempFile, yaml);

        const persona = resolvePersona(tempFile);
        expect(persona.id).toBe('file_persona');
      });

      it('should throw for unknown persona', () => {
        expect(() => resolvePersona('unknown_persona_xyz')).toThrow('Unknown persona');
      });
    });

    describe('loadPersonaFromFile', () => {
      it('should load valid persona from YAML', () => {
        const yaml = `
id: yaml_persona
name: YAML Persona
description: A test persona
systemPrompt: You are a test persona.
questionBias:
  happyPath: 0.3
  edgeCase: 0.3
  errorHandling: 0.2
  boundary: 0.2
categories:
  - happy_path
  - edge_case
additionalContext: Extra context here
`;
        writeFileSync(tempFile, yaml);

        const persona = loadPersonaFromFile(tempFile);
        expect(persona.id).toBe('yaml_persona');
        expect(persona.name).toBe('YAML Persona');
        expect(persona.description).toBe('A test persona');
        expect(persona.systemPrompt).toBe('You are a test persona.');
        expect(persona.questionBias.happyPath).toBe(0.3);
        expect(persona.categories).toContain('happy_path');
        expect(persona.categories).toContain('edge_case');
        expect(persona.additionalContext).toBe('Extra context here');
        expect(persona.builtin).toBe(false);
      });

      it('should apply defaults for missing optional fields', () => {
        const yaml = `
id: minimal
name: Minimal Persona
systemPrompt: Minimal prompt
`;
        writeFileSync(tempFile, yaml);

        const persona = loadPersonaFromFile(tempFile);
        expect(persona.description).toContain('Custom persona');
        expect(persona.questionBias.happyPath).toBe(0.25);
        expect(persona.questionBias.edgeCase).toBe(0.25);
        expect(persona.categories).toContain('happy_path');
      });

      it('should throw for missing required fields', () => {
        const yamlMissingId = `
name: No ID
systemPrompt: Prompt
`;
        writeFileSync(tempFile, yamlMissingId);
        expect(() => loadPersonaFromFile(tempFile)).toThrow('missing required field: id');
      });

      it('should throw for missing name', () => {
        const yaml = `
id: no_name
systemPrompt: Prompt
`;
        writeFileSync(tempFile, yaml);
        expect(() => loadPersonaFromFile(tempFile)).toThrow('missing required field: name');
      });

      it('should throw for missing systemPrompt', () => {
        const yaml = `
id: no_prompt
name: No Prompt
`;
        writeFileSync(tempFile, yaml);
        expect(() => loadPersonaFromFile(tempFile)).toThrow('missing required field: systemPrompt');
      });

      it('should throw for invalid category', () => {
        const yaml = `
id: bad_category
name: Bad Category
systemPrompt: Prompt
categories:
  - invalid_category
`;
        writeFileSync(tempFile, yaml);
        expect(() => loadPersonaFromFile(tempFile)).toThrow('Invalid category');
      });

      it('should throw for non-existent file', () => {
        expect(() => loadPersonaFromFile('/nonexistent/path.yaml')).toThrow('not found');
      });
    });

    describe('generateSamplePersonaYaml', () => {
      it('should generate valid YAML sample', () => {
        const sample = generateSamplePersonaYaml();
        expect(sample).toContain('id:');
        expect(sample).toContain('name:');
        expect(sample).toContain('systemPrompt:');
        expect(sample).toContain('questionBias:');
        expect(sample).toContain('categories:');
      });
    });
  });
});
