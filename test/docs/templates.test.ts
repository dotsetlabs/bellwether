import { describe, it, expect } from 'vitest';
import {
  AGENTS_MD_HEADER,
  OVERVIEW_SECTION,
  CAPABILITIES_SECTION,
  TOOL_SECTION_HEADER,
  TOOL_ENTRY,
  LIMITATIONS_SECTION,
  RECOMMENDATIONS_SECTION,
  INTERVIEW_METADATA,
} from '../../src/docs/templates.js';

describe('Documentation Templates', () => {
  describe('AGENTS_MD_HEADER', () => {
    it('should contain server name placeholder', () => {
      expect(AGENTS_MD_HEADER).toContain('{{serverName}}');
    });

    it('should contain date placeholder', () => {
      expect(AGENTS_MD_HEADER).toContain('{{date}}');
    });

    it('should start with a heading', () => {
      expect(AGENTS_MD_HEADER).toMatch(/^# /);
    });

    it('should contain Bellwether attribution', () => {
      expect(AGENTS_MD_HEADER).toContain('Bellwether');
    });

    it('should contain link to Bellwether GitHub', () => {
      expect(AGENTS_MD_HEADER).toContain('github.com/dotsetlabs/bellwether');
    });
  });

  describe('OVERVIEW_SECTION', () => {
    it('should contain summary placeholder', () => {
      expect(OVERVIEW_SECTION).toContain('{{summary}}');
    });

    it('should contain version placeholder', () => {
      expect(OVERVIEW_SECTION).toContain('{{version}}');
    });

    it('should contain protocol version placeholder', () => {
      expect(OVERVIEW_SECTION).toContain('{{protocolVersion}}');
    });

    it('should have Overview heading', () => {
      expect(OVERVIEW_SECTION).toContain('## Overview');
    });

    it('should include Server Version label', () => {
      expect(OVERVIEW_SECTION).toContain('**Server Version:**');
    });

    it('should include Protocol Version label', () => {
      expect(OVERVIEW_SECTION).toContain('**Protocol Version:**');
    });
  });

  describe('CAPABILITIES_SECTION', () => {
    it('should have Capabilities heading', () => {
      expect(CAPABILITIES_SECTION).toContain('## Capabilities');
    });

    it('should contain handlebars each loop', () => {
      expect(CAPABILITIES_SECTION).toContain('{{#each capabilities}}');
      expect(CAPABILITIES_SECTION).toContain('{{/each}}');
    });

    it('should contain name placeholder', () => {
      expect(CAPABILITIES_SECTION).toContain('{{name}}');
    });

    it('should contain count placeholder', () => {
      expect(CAPABILITIES_SECTION).toContain('{{count}}');
    });

    it('should format as bullet list', () => {
      expect(CAPABILITIES_SECTION).toContain('- **');
    });
  });

  describe('TOOL_SECTION_HEADER', () => {
    it('should have Tools heading', () => {
      expect(TOOL_SECTION_HEADER).toContain('## Tools');
    });
  });

  describe('TOOL_ENTRY', () => {
    it('should contain name placeholder', () => {
      expect(TOOL_ENTRY).toContain('{{name}}');
    });

    it('should contain description placeholder', () => {
      expect(TOOL_ENTRY).toContain('{{description}}');
    });

    it('should contain inputSchema placeholder', () => {
      expect(TOOL_ENTRY).toContain('{{inputSchema}}');
    });

    it('should have h3 heading for tool name', () => {
      expect(TOOL_ENTRY).toMatch(/### \{\{name\}\}/);
    });

    it('should have Input Schema section', () => {
      expect(TOOL_ENTRY).toContain('**Input Schema:**');
    });

    it('should wrap input schema in JSON code block', () => {
      expect(TOOL_ENTRY).toContain('```json');
      expect(TOOL_ENTRY).toContain('```');
    });

    it('should have conditional behavioral notes section', () => {
      expect(TOOL_ENTRY).toContain('{{#if behavioralNotes}}');
      expect(TOOL_ENTRY).toContain('**Observed Behavior:**');
    });

    it('should have conditional limitations section', () => {
      expect(TOOL_ENTRY).toContain('{{#if limitations}}');
      expect(TOOL_ENTRY).toContain('**Limitations:**');
    });

    it('should have conditional security notes section', () => {
      expect(TOOL_ENTRY).toContain('{{#if securityNotes}}');
      expect(TOOL_ENTRY).toContain('**Security Considerations:**');
    });

    it('should iterate over behavioral notes', () => {
      expect(TOOL_ENTRY).toContain('{{#each behavioralNotes}}');
    });

    it('should iterate over limitations', () => {
      expect(TOOL_ENTRY).toContain('{{#each limitations}}');
    });

    it('should iterate over security notes', () => {
      expect(TOOL_ENTRY).toContain('{{#each securityNotes}}');
    });
  });

  describe('LIMITATIONS_SECTION', () => {
    it('should have Known Limitations heading', () => {
      expect(LIMITATIONS_SECTION).toContain('## Known Limitations');
    });

    it('should contain each loop for limitations', () => {
      expect(LIMITATIONS_SECTION).toContain('{{#each limitations}}');
      expect(LIMITATIONS_SECTION).toContain('{{/each}}');
    });

    it('should format as bullet list', () => {
      expect(LIMITATIONS_SECTION).toContain('- {{this}}');
    });
  });

  describe('RECOMMENDATIONS_SECTION', () => {
    it('should have Recommendations heading', () => {
      expect(RECOMMENDATIONS_SECTION).toContain('## Recommendations');
    });

    it('should contain each loop for recommendations', () => {
      expect(RECOMMENDATIONS_SECTION).toContain('{{#each recommendations}}');
      expect(RECOMMENDATIONS_SECTION).toContain('{{/each}}');
    });

    it('should format as bullet list', () => {
      expect(RECOMMENDATIONS_SECTION).toContain('- {{this}}');
    });
  });

  describe('INTERVIEW_METADATA', () => {
    it('should contain duration placeholder', () => {
      expect(INTERVIEW_METADATA).toContain('{{duration}}');
    });

    it('should contain toolCalls placeholder', () => {
      expect(INTERVIEW_METADATA).toContain('{{toolCalls}}');
    });

    it('should be formatted as italicized text', () => {
      expect(INTERVIEW_METADATA).toContain('*Interview completed');
      expect(INTERVIEW_METADATA).toContain('tool calls.*');
    });

    it('should mention interview completion', () => {
      expect(INTERVIEW_METADATA).toContain('Interview completed in');
    });

    it('should mention tool calls', () => {
      expect(INTERVIEW_METADATA).toContain('tool calls');
    });

    it('should start with horizontal rule', () => {
      expect(INTERVIEW_METADATA).toMatch(/^---/);
    });
  });

  describe('template structure', () => {
    it('all templates should be non-empty strings', () => {
      const templates = [
        AGENTS_MD_HEADER,
        OVERVIEW_SECTION,
        CAPABILITIES_SECTION,
        TOOL_SECTION_HEADER,
        TOOL_ENTRY,
        LIMITATIONS_SECTION,
        RECOMMENDATIONS_SECTION,
        INTERVIEW_METADATA,
      ];

      templates.forEach(template => {
        expect(typeof template).toBe('string');
        expect(template.length).toBeGreaterThan(0);
      });
    });

    it('handlebars conditionals should be properly closed', () => {
      const templatesWithConditionals = [TOOL_ENTRY];

      templatesWithConditionals.forEach(template => {
        const ifCount = (template.match(/\{\{#if/g) || []).length;
        const endIfCount = (template.match(/\{\{\/if\}\}/g) || []).length;
        expect(ifCount).toBe(endIfCount);
      });
    });

    it('handlebars each loops should be properly closed', () => {
      const templates = [
        CAPABILITIES_SECTION,
        TOOL_ENTRY,
        LIMITATIONS_SECTION,
        RECOMMENDATIONS_SECTION,
      ];

      templates.forEach(template => {
        const eachCount = (template.match(/\{\{#each/g) || []).length;
        const endEachCount = (template.match(/\{\{\/each\}\}/g) || []).length;
        expect(eachCount).toBe(endEachCount);
      });
    });

    it('section headers should use h2 markdown format', () => {
      const sectionTemplates = [
        OVERVIEW_SECTION,
        CAPABILITIES_SECTION,
        TOOL_SECTION_HEADER,
        LIMITATIONS_SECTION,
        RECOMMENDATIONS_SECTION,
      ];

      sectionTemplates.forEach(template => {
        expect(template).toMatch(/## /);
      });
    });
  });

  describe('placeholder validation', () => {
    it('placeholders should use double curly braces', () => {
      const allTemplates = [
        AGENTS_MD_HEADER,
        OVERVIEW_SECTION,
        CAPABILITIES_SECTION,
        TOOL_ENTRY,
        LIMITATIONS_SECTION,
        RECOMMENDATIONS_SECTION,
        INTERVIEW_METADATA,
      ].join('');

      // Find all placeholders
      const placeholders = allTemplates.match(/\{\{[^}]+\}\}/g) || [];

      // All should be valid handlebars syntax (including block helpers like #each, #if, /each, /if)
      placeholders.forEach(placeholder => {
        // Valid patterns:
        // {{variable}} - simple variable
        // {{this}} - iterator context
        // {{#each items}} - block helper start
        // {{/each}} - block helper end
        // {{#if condition}} - conditional start
        // {{/if}} - conditional end
        expect(placeholder).toMatch(/^\{\{[#/]?[a-zA-Z_][a-zA-Z0-9_]*(\s+[a-zA-Z_][a-zA-Z0-9_]*)?\}\}$|^\{\{this\}\}$/);
      });
    });
  });
});
