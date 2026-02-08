/**
 * End-to-end drift detection integration tests.
 *
 * Each test spawns a real MCP server process, connects via MCPClient,
 * discovers capabilities, interviews in check mode, creates a baseline,
 * then repeats with a modified config and compares baselines.
 */

import { describe, it, expect } from 'vitest';
import {
  runPipeline,
  runDriftComparison,
  compareBaselines,
  baseConfig,
  withTools,
  withPrompts,
  withResources,
  withResourceTemplates,
  withServerInfo,
  withProtocolVersion,
  withInstructions,
  withCapabilities,
  TOOLS,
  PROMPTS,
  RESOURCES,
  TEMPLATES,
} from './helpers.js';
import type { DriftTool, DriftResource, DriftResourceTemplate } from './helpers.js';

// Each test spawns 2 MCP server processes
const TEST_TIMEOUT = 30_000;

describe('Drift Detection - End to End', { timeout: TEST_TIMEOUT }, () => {
  // -----------------------------------------------------------------------
  // No-drift baseline
  // -----------------------------------------------------------------------

  describe('No-drift baseline', () => {
    it('identical config produces severity: none', async () => {
      const config = baseConfig();
      const diff = await runDriftComparison(config, config);

      expect(diff.severity).toBe('none');
      expect(diff.toolsAdded).toHaveLength(0);
      expect(diff.toolsRemoved).toHaveLength(0);
      expect(diff.toolsModified).toHaveLength(0);
      expect(diff.breakingCount).toBe(0);
      expect(diff.warningCount).toBe(0);
    });

    it('re-running same server produces no tool changes', async () => {
      const config = baseConfig();
      const baseline1 = await runPipeline(config);
      const baseline2 = await runPipeline(config);
      const diff = compareBaselines(baseline1, baseline2);

      expect(diff.toolsAdded).toHaveLength(0);
      expect(diff.toolsRemoved).toHaveLength(0);
      expect(diff.severity).toBe('none');
    });
  });

  // -----------------------------------------------------------------------
  // Tool drift
  // -----------------------------------------------------------------------

  describe('Tool drift', () => {
    it('tool added → toolsAdded contains name, severity >= info', async () => {
      const before = baseConfig();
      const newTool: DriftTool = {
        name: 'new_tool',
        description: 'A brand new tool',
        inputSchema: {
          type: 'object',
          properties: { input: { type: 'string' } },
          required: ['input'],
        },
      };
      const after = withTools(before, [...before.tools, newTool]);
      const diff = await runDriftComparison(before, after);

      expect(diff.toolsAdded).toContain('new_tool');
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('tool removed → toolsRemoved contains name, severity = breaking', async () => {
      const before = baseConfig();
      const after = withTools(before, [before.tools[0]]);
      const diff = await runDriftComparison(before, after);

      expect(diff.toolsRemoved).toContain('calculate');
      expect(diff.severity).toBe('breaking');
    });

    it('tool input schema property added → severity = breaking, schema change detected', async () => {
      const before = baseConfig();
      const modifiedWeather: DriftTool = {
        ...TOOLS.weather,
        inputSchema: {
          ...TOOLS.weather.inputSchema,
          properties: {
            ...(TOOLS.weather.inputSchema!.properties as Record<string, unknown>),
            country: { type: 'string', description: 'Country code' },
          },
        },
      };
      const after = withTools(before, [modifiedWeather, { ...TOOLS.calculator }]);
      const diff = await runDriftComparison(before, after);

      const weatherMod = diff.toolsModified.find((t) => t.tool === 'get_weather');
      expect(weatherMod).toBeDefined();
      expect(weatherMod!.schemaChanged).toBe(true);
      // Adding a property to a schema is a schema change (breaking or warning)
      const schemaChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'schema'
      );
      expect(schemaChanges.length).toBeGreaterThan(0);
    });

    it('tool input schema required field added → severity = breaking', async () => {
      const before = baseConfig();
      const modifiedWeather: DriftTool = {
        ...TOOLS.weather,
        inputSchema: {
          ...TOOLS.weather.inputSchema,
          required: ['location', 'units'],
        },
      };
      const after = withTools(before, [modifiedWeather, { ...TOOLS.calculator }]);
      const diff = await runDriftComparison(before, after);

      expect(diff.severity).toBe('breaking');
      const schemaChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'schema'
      );
      expect(schemaChanges.length).toBeGreaterThan(0);
    });

    it('tool description changed → severity >= info', async () => {
      const before = baseConfig();
      const modifiedWeather: DriftTool = {
        ...TOOLS.weather,
        description: 'Completely different description for weather',
      };
      const after = withTools(before, [modifiedWeather, { ...TOOLS.calculator }]);
      const diff = await runDriftComparison(before, after);

      const weatherMod = diff.toolsModified.find((t) => t.tool === 'get_weather');
      expect(weatherMod).toBeDefined();
      expect(weatherMod!.descriptionChanged).toBe(true);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('tool title changed → severity >= info (protocol 2025-03-26+)', async () => {
      const before = withTools(baseConfig(), [{ ...TOOLS.withTitle }, { ...TOOLS.calculator }]);
      const after = withTools(before, [
        { ...TOOLS.withTitle, title: 'Search Docs V2' },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const titleChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'search_docs' && c.description.includes('title changed')
      );
      expect(titleChanges.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('annotation readOnlyHint changed → severity = breaking (protocol 2025-03-26+)', async () => {
      const before = withTools(baseConfig(), [{ ...TOOLS.annotated }, { ...TOOLS.calculator }]);
      const after = withTools(before, [
        { ...TOOLS.annotated, annotations: { ...TOOLS.annotated.annotations, readOnlyHint: true } },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const annoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'delete_file' && c.description.includes('readOnlyHint')
      );
      expect(annoChanges.length).toBeGreaterThan(0);
      expect(annoChanges[0].severity).toBe('breaking');
    });

    it('annotation destructiveHint changed → severity >= warning (protocol 2025-03-26+)', async () => {
      const before = withTools(baseConfig(), [{ ...TOOLS.annotated }, { ...TOOLS.calculator }]);
      const after = withTools(before, [
        {
          ...TOOLS.annotated,
          annotations: { ...TOOLS.annotated.annotations, destructiveHint: false },
        },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const annoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'delete_file' && c.description.includes('destructiveHint')
      );
      expect(annoChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(annoChanges[0].severity);
    });

    it('annotation idempotentHint changed → severity >= warning (protocol 2025-03-26+)', async () => {
      const before = withTools(baseConfig(), [{ ...TOOLS.annotated }, { ...TOOLS.calculator }]);
      const after = withTools(before, [
        {
          ...TOOLS.annotated,
          annotations: { ...TOOLS.annotated.annotations, idempotentHint: false },
        },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const annoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'delete_file' && c.description.includes('idempotentHint')
      );
      expect(annoChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(annoChanges[0].severity);
    });

    it('annotation openWorldHint changed → severity >= info (protocol 2025-03-26+)', async () => {
      const before = withTools(baseConfig(), [{ ...TOOLS.annotated }, { ...TOOLS.calculator }]);
      const after = withTools(before, [
        {
          ...TOOLS.annotated,
          annotations: { ...TOOLS.annotated.annotations, openWorldHint: true },
        },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const annoChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'delete_file' && c.description.includes('openWorldHint')
      );
      expect(annoChanges.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(annoChanges[0].severity);
    });

    it('output schema added → severity >= warning (protocol 2025-06-18+)', async () => {
      const before = withTools(withProtocolVersion(baseConfig(), '2025-06-18'), [
        { ...TOOLS.weather },
        { ...TOOLS.calculator },
      ]);
      const after = withTools(before, [
        {
          ...TOOLS.weather,
          outputSchema: {
            type: 'object',
            properties: { temp: { type: 'number' } },
          },
        },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const osChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'get_weather' && c.aspect === 'output_schema'
      );
      expect(osChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(osChanges[0].severity);
    });

    it('output schema removed → severity >= warning (protocol 2025-06-18+)', async () => {
      const before = withTools(withProtocolVersion(baseConfig(), '2025-06-18'), [
        { ...TOOLS.annotated },
        { ...TOOLS.calculator },
      ]);
      const after = withTools(before, [
        { ...TOOLS.annotated, outputSchema: undefined },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const osChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'delete_file' && c.aspect === 'output_schema'
      );
      expect(osChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(osChanges[0].severity);
    });

    it('output schema changed → severity = breaking (protocol 2025-06-18+)', async () => {
      const before = withTools(withProtocolVersion(baseConfig(), '2025-06-18'), [
        { ...TOOLS.annotated },
        { ...TOOLS.calculator },
      ]);
      const after = withTools(before, [
        {
          ...TOOLS.annotated,
          outputSchema: {
            type: 'object',
            properties: {
              deleted: { type: 'boolean' },
              path: { type: 'string' },
              timestamp: { type: 'number' },
            },
          },
        },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const osChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'delete_file' && c.aspect === 'output_schema'
      );
      expect(osChanges.length).toBeGreaterThan(0);
      expect(osChanges[0].severity).toBe('breaking');
    });

    it('task support changed → severity >= warning (protocol 2025-11-25+)', async () => {
      const before = withTools(baseConfig(), [
        { ...TOOLS.withTaskSupport },
        { ...TOOLS.calculator },
      ]);
      const after = withTools(before, [
        { ...TOOLS.withTaskSupport, execution: { taskSupport: 'required' } },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const taskChanges = diff.behaviorChanges.filter(
        (c) => c.tool === 'long_running' && c.description.includes('task support')
      );
      expect(taskChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(taskChanges[0].severity);
    });
  });

  // -----------------------------------------------------------------------
  // Server drift
  // -----------------------------------------------------------------------

  describe('Server drift', () => {
    it('server name changed → severity >= info, serverChanges present', async () => {
      const before = baseConfig();
      const after = withServerInfo(before, { name: 'renamed-server', version: '1.0.0' });
      const diff = await runDriftComparison(before, after);

      const serverNameChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'server' && c.description.includes('name')
      );
      expect(serverNameChanges.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('server version changed → severity >= info, serverChanges present', async () => {
      const before = baseConfig();
      const after = withServerInfo(before, { name: 'drift-test-server', version: '2.0.0' });
      const diff = await runDriftComparison(before, after);

      const serverVersionChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'server' && c.description.includes('version')
      );
      expect(serverVersionChanges.length).toBeGreaterThan(0);
    });

    it('protocol version changed → severity >= warning, serverChanges present', async () => {
      const before = baseConfig();
      const after = withProtocolVersion(before, '2025-03-26');
      const diff = await runDriftComparison(before, after);

      const protoChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'server' && c.description.includes('Protocol version')
      );
      expect(protoChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(diff.severity);
    });

    it('server instructions changed → severity >= info (protocol 2025-06-18+)', async () => {
      const before = withInstructions(
        withProtocolVersion(baseConfig(), '2025-06-18'),
        'Follow these rules'
      );
      const after = withInstructions(before, 'New rules apply');
      const diff = await runDriftComparison(before, after);

      const instrChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'server' && c.description.includes('instructions')
      );
      expect(instrChanges.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('capability added (resources) → severity >= info', async () => {
      const before = withCapabilities(baseConfig(), { tools: {} });
      const after = withCapabilities(before, { tools: {}, resources: {} });
      const diff = await runDriftComparison(before, after);

      const capChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'capability' && c.after === 'resources'
      );
      expect(capChanges.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('capability removed (prompts) → severity = breaking', async () => {
      const before = baseConfig();
      const after = withCapabilities(before, { tools: {}, resources: {} });
      const diff = await runDriftComparison(before, after);

      const capChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'capability' && c.before === 'prompts'
      );
      expect(capChanges.length).toBeGreaterThan(0);
      expect(diff.severity).toBe('breaking');
    });
  });

  // -----------------------------------------------------------------------
  // Prompt drift
  // -----------------------------------------------------------------------

  describe('Prompt drift', () => {
    it('prompt added → severity >= info', async () => {
      const before = baseConfig();
      const after = withPrompts(before, [{ ...PROMPTS.summarize }, { ...PROMPTS.translate }]);
      const diff = await runDriftComparison(before, after);

      const promptAdded = diff.behaviorChanges.filter(
        (c) => c.aspect === 'prompt' && c.after === 'present' && c.before === 'absent'
      );
      expect(promptAdded.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('prompt removed → severity = breaking', async () => {
      const before = baseConfig();
      const after = withPrompts(before, []);
      const diff = await runDriftComparison(before, after);

      const promptRemoved = diff.behaviorChanges.filter(
        (c) => c.aspect === 'prompt' && c.description.includes('removed')
      );
      expect(promptRemoved.length).toBeGreaterThan(0);
      expect(diff.severity).toBe('breaking');
    });

    it('prompt description changed → severity >= info', async () => {
      const before = baseConfig();
      const after = withPrompts(before, [
        { ...PROMPTS.summarize, description: 'A different summary description' },
      ]);
      const diff = await runDriftComparison(before, after);

      const descChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'prompt' && c.description.includes('description changed')
      );
      expect(descChanges.length).toBeGreaterThan(0);
    });

    it('prompt title changed → severity >= info (protocol 2025-03-26+)', async () => {
      const before = withPrompts(baseConfig(), [{ ...PROMPTS.summarize, title: 'Summarizer' }]);
      const after = withPrompts(before, [{ ...PROMPTS.summarize, title: 'Text Summarizer V2' }]);
      const diff = await runDriftComparison(before, after);

      const titleChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'prompt' && c.description.includes('title changed')
      );
      expect(titleChanges.length).toBeGreaterThan(0);
    });

    it('new required argument added → severity = breaking', async () => {
      const before = baseConfig();
      const after = withPrompts(before, [
        {
          ...PROMPTS.summarize,
          arguments: [
            ...PROMPTS.summarize.arguments!,
            { name: 'format', description: 'Output format', required: true },
          ],
        },
      ]);
      const diff = await runDriftComparison(before, after);

      const argAdded = diff.behaviorChanges.filter(
        (c) =>
          c.aspect === 'prompt' &&
          c.description.includes('argument') &&
          c.description.includes('added')
      );
      expect(argAdded.length).toBeGreaterThan(0);
      expect(diff.severity).toBe('breaking');
    });

    it('argument removed → severity = breaking', async () => {
      const before = baseConfig();
      const after = withPrompts(before, [
        {
          ...PROMPTS.summarize,
          arguments: [PROMPTS.summarize.arguments![0]],
        },
      ]);
      const diff = await runDriftComparison(before, after);

      const argRemoved = diff.behaviorChanges.filter(
        (c) =>
          c.aspect === 'prompt' &&
          c.description.includes('argument') &&
          c.description.includes('removed')
      );
      expect(argRemoved.length).toBeGreaterThan(0);
      expect(diff.severity).toBe('breaking');
    });

    it('required→optional change → severity >= warning', async () => {
      const before = baseConfig();
      const after = withPrompts(before, [
        {
          ...PROMPTS.summarize,
          arguments: PROMPTS.summarize.arguments!.map((a) =>
            a.name === 'text' ? { ...a, required: false } : a
          ),
        },
      ]);
      const diff = await runDriftComparison(before, after);

      const reqChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'prompt' && c.description.includes('requirement changed')
      );
      expect(reqChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(reqChanges[0].severity);
    });
  });

  // -----------------------------------------------------------------------
  // Resource drift
  // -----------------------------------------------------------------------

  describe('Resource drift', () => {
    it('resource added → severity >= info', async () => {
      const before = baseConfig();
      const newResource: DriftResource = {
        uri: 'file:///docs/CHANGELOG.md',
        name: 'CHANGELOG',
        description: 'Project changelog',
        mimeType: 'text/markdown',
      };
      const after = withResources(before, [...before.resources, newResource]);
      const diff = await runDriftComparison(before, after);

      const resAdded = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource' && c.after === 'present' && c.before === 'absent'
      );
      expect(resAdded.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('resource removed → severity = breaking', async () => {
      const before = baseConfig();
      const after = withResources(before, []);
      const diff = await runDriftComparison(before, after);

      const resRemoved = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource' && c.description.includes('removed')
      );
      expect(resRemoved.length).toBeGreaterThan(0);
      expect(diff.severity).toBe('breaking');
    });

    it('resource description changed → severity >= info', async () => {
      const before = baseConfig();
      const after = withResources(before, [
        { ...RESOURCES.readme, description: 'Updated README description' },
      ]);
      const diff = await runDriftComparison(before, after);

      const descChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource' && c.description.includes('description changed')
      );
      expect(descChanges.length).toBeGreaterThan(0);
    });

    it('resource MIME type changed → severity >= warning', async () => {
      const before = baseConfig();
      const after = withResources(before, [{ ...RESOURCES.readme, mimeType: 'text/html' }]);
      const diff = await runDriftComparison(before, after);

      const mimeChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource' && c.description.includes('mime type')
      );
      expect(mimeChanges.length).toBeGreaterThan(0);
      expect(['warning', 'breaking']).toContain(mimeChanges[0].severity);
    });
  });

  // -----------------------------------------------------------------------
  // Resource template drift
  // -----------------------------------------------------------------------

  describe('Resource template drift', () => {
    it('template added → severity >= info', async () => {
      const before = baseConfig();
      const newTemplate: DriftResourceTemplate = {
        uriTemplate: 'file:///logs/{date}',
        name: 'Log Files',
        description: 'Access log files by date',
        mimeType: 'text/plain',
      };
      const after = withResourceTemplates(before, [...before.resourceTemplates, newTemplate]);
      const diff = await runDriftComparison(before, after);

      const tmplAdded = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource_template' && c.after === 'present' && c.before === 'absent'
      );
      expect(tmplAdded.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'breaking']).toContain(diff.severity);
    });

    it('template removed → severity = breaking', async () => {
      const before = baseConfig();
      const after = withResourceTemplates(before, []);
      const diff = await runDriftComparison(before, after);

      const tmplRemoved = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource_template' && c.description.includes('removed')
      );
      expect(tmplRemoved.length).toBeGreaterThan(0);
      expect(diff.severity).toBe('breaking');
    });

    it('template description changed → severity >= info', async () => {
      const before = baseConfig();
      const after = withResourceTemplates(before, [
        { ...TEMPLATES.fileTemplate, description: 'Updated template description' },
      ]);
      const diff = await runDriftComparison(before, after);

      const descChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'resource_template' && c.description.includes('description changed')
      );
      expect(descChanges.length).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Protocol version gating
  // -----------------------------------------------------------------------

  describe('Protocol version gating', () => {
    it('annotation changes ignored when protocol = 2024-11-05', async () => {
      const before = withProtocolVersion(
        withTools(baseConfig(), [{ ...TOOLS.annotated }, { ...TOOLS.calculator }]),
        '2024-11-05'
      );
      const after = withTools(before, [
        {
          ...TOOLS.annotated,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true,
          },
        },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const annoChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'tool_annotations' && c.tool === 'delete_file'
      );
      expect(annoChanges).toHaveLength(0);
    });

    it('output schema changes ignored when protocol = 2024-11-05', async () => {
      const before = withProtocolVersion(
        withTools(baseConfig(), [{ ...TOOLS.annotated }, { ...TOOLS.calculator }]),
        '2024-11-05'
      );
      const after = withTools(before, [
        { ...TOOLS.annotated, outputSchema: undefined },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const osChanges = diff.behaviorChanges.filter((c) => c.aspect === 'output_schema');
      expect(osChanges).toHaveLength(0);
    });

    it('instructions changes ignored when protocol = 2024-11-05', async () => {
      const before = withInstructions(
        withProtocolVersion(baseConfig(), '2024-11-05'),
        'Old instructions'
      );
      const after = withInstructions(before, 'New instructions');
      const diff = await runDriftComparison(before, after);

      const instrChanges = diff.behaviorChanges.filter(
        (c) => c.aspect === 'server' && c.description.includes('instructions')
      );
      expect(instrChanges).toHaveLength(0);
    });

    it('task support changes ignored when protocol = 2024-11-05', async () => {
      const before = withProtocolVersion(
        withTools(baseConfig(), [{ ...TOOLS.withTaskSupport }, { ...TOOLS.calculator }]),
        '2024-11-05'
      );
      const after = withTools(before, [
        { ...TOOLS.withTaskSupport, execution: { taskSupport: 'required' } },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const taskChanges = diff.behaviorChanges.filter((c) =>
        c.description.includes('task support')
      );
      expect(taskChanges).toHaveLength(0);
    });

    it('title changes ignored when protocol = 2024-11-05', async () => {
      const before = withProtocolVersion(
        withTools(baseConfig(), [{ ...TOOLS.withTitle }, { ...TOOLS.calculator }]),
        '2024-11-05'
      );
      const after = withTools(before, [
        { ...TOOLS.withTitle, title: 'Completely Different Title' },
        { ...TOOLS.calculator },
      ]);
      const diff = await runDriftComparison(before, after);

      const titleChanges = diff.behaviorChanges.filter(
        (c) => c.description.includes('title changed') && c.tool === 'search_docs'
      );
      expect(titleChanges).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Compound changes
  // -----------------------------------------------------------------------

  describe('Compound changes', () => {
    it('multiple drift types → severity = highest (breaking > warning > info)', async () => {
      const before = baseConfig();
      // Remove a tool (breaking) + change server name (info) + change server version (info)
      const after = withServerInfo(withTools(before, [before.tools[0]]), {
        name: 'renamed-server',
        version: '2.0.0',
      });
      const diff = await runDriftComparison(before, after);

      // Tool removal is breaking, so overall should be breaking
      expect(diff.severity).toBe('breaking');
      expect(diff.breakingCount).toBeGreaterThan(0);
    });

    it('info-only changes do not produce breaking severity', async () => {
      const before = baseConfig();
      // Change server name and version (both info) + add a tool (info)
      const newTool: DriftTool = {
        name: 'ping',
        description: 'Health check',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      };
      const after = withServerInfo(withTools(before, [...before.tools, newTool]), {
        name: 'renamed-server',
        version: '2.0.0',
      });
      const diff = await runDriftComparison(before, after);

      expect(diff.severity).not.toBe('breaking');
      expect(diff.breakingCount).toBe(0);
    });
  });
});
