/**
 * Pipeline helpers and config builders for drift detection integration tests.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MCPClient } from '../../src/transport/mcp-client.js';
import { discover } from '../../src/discovery/discovery.js';
import { Interviewer } from '../../src/interview/interviewer.js';
import { createBaseline } from '../../src/baseline/saver.js';
import { compareBaselines } from '../../src/baseline/comparator.js';
import { getTsxCommand } from '../fixtures/tsx-command.js';
import type {
  BehavioralBaseline,
  BehavioralDiff,
  CompareOptions,
  WorkflowSignature,
  PerformanceConfidence,
} from '../../src/baseline/types.js';
import type { ResponseFingerprint, ErrorPattern } from '../../src/baseline/response-fingerprint.js';
import type { ResponseSchemaEvolution } from '../../src/baseline/response-schema-tracker.js';
import type { SecurityFingerprint } from '../../src/security/types.js';
import type {
  ToolCapability,
  ResourceCapability,
  PromptCapability,
  ResourceTemplateCapability,
  DocumentationScoreSummary,
} from '../../src/baseline/baseline-format.js';

// ---------------------------------------------------------------------------
// Drift config types (mirrors drift-mock-server.ts)
// ---------------------------------------------------------------------------

export interface DriftTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  title?: string;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  execution?: { taskSupport?: string };
}

export interface DriftPrompt {
  name: string;
  description?: string;
  title?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface DriftResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  title?: string;
  annotations?: { audience?: string[]; priority?: number; lastModified?: string };
  size?: number;
}

export interface DriftResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface DriftConfig {
  serverInfo: { name: string; version: string };
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  instructions?: string;
  tools: DriftTool[];
  prompts: DriftPrompt[];
  resources: DriftResource[];
  resourceTemplates: DriftResourceTemplate[];
  toolResponses?: Record<string, { text: string; isError?: boolean }>;
}

// ---------------------------------------------------------------------------
// Server path
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DRIFT_SERVER_PATH = join(__dirname, 'drift-mock-server.ts');
const { command: TSX_PATH, args: TSX_BASE_ARGS } = getTsxCommand(DRIFT_SERVER_PATH);

// ---------------------------------------------------------------------------
// Pre-built entity definitions
// ---------------------------------------------------------------------------

export const TOOLS = {
  weather: {
    name: 'get_weather',
    description: 'Get the current weather for a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name or zip code' },
        units: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature units',
        },
      },
      required: ['location'],
    },
  } satisfies DriftTool,

  calculator: {
    name: 'calculate',
    description: 'Perform mathematical calculations',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate',
        },
        precision: {
          type: 'number',
          description: 'Decimal places for result',
        },
      },
      required: ['expression'],
    },
  } satisfies DriftTool,

  annotated: {
    name: 'delete_file',
    description: 'Delete a file from the filesystem',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to delete' },
      },
      required: ['path'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        deleted: { type: 'boolean' },
        path: { type: 'string' },
      },
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  } satisfies DriftTool,

  withTitle: {
    name: 'search_docs',
    title: 'Search Documentation',
    description: 'Search the documentation index',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  } satisfies DriftTool,

  withTaskSupport: {
    name: 'long_running',
    description: 'A long-running operation',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task to run' },
      },
      required: ['task'],
    },
    execution: { taskSupport: 'optional' },
  } satisfies DriftTool,
} as const;

export const PROMPTS = {
  summarize: {
    name: 'summarize',
    description: 'Summarize the given text',
    arguments: [
      { name: 'text', description: 'Text to summarize', required: true },
      { name: 'max_length', description: 'Maximum summary length', required: false },
    ],
  } satisfies DriftPrompt,

  translate: {
    name: 'translate',
    description: 'Translate text to another language',
    arguments: [
      { name: 'text', description: 'Text to translate', required: true },
      { name: 'target_language', description: 'Target language code', required: true },
    ],
  } satisfies DriftPrompt,
} as const;

export const RESOURCES = {
  readme: {
    uri: 'file:///docs/README.md',
    name: 'README',
    description: 'Project README file',
    mimeType: 'text/markdown',
  } satisfies DriftResource,
} as const;

export const TEMPLATES = {
  fileTemplate: {
    uriTemplate: 'file:///docs/{path}',
    name: 'Documentation Files',
    description: 'Access documentation files by path',
    mimeType: 'text/markdown',
  } satisfies DriftResourceTemplate,
} as const;

// ---------------------------------------------------------------------------
// Config builder functions
// ---------------------------------------------------------------------------

export function baseConfig(): DriftConfig {
  return {
    serverInfo: { name: 'drift-test-server', version: '1.0.0' },
    protocolVersion: '2025-11-25',
    capabilities: { tools: {}, prompts: {}, resources: {} },
    tools: [{ ...TOOLS.weather }, { ...TOOLS.calculator }],
    prompts: [{ ...PROMPTS.summarize }],
    resources: [{ ...RESOURCES.readme }],
    resourceTemplates: [{ ...TEMPLATES.fileTemplate }],
  };
}

export function withTools(config: DriftConfig, tools: DriftTool[]): DriftConfig {
  return { ...config, tools: tools.map((t) => ({ ...t })) };
}

export function withPrompts(config: DriftConfig, prompts: DriftPrompt[]): DriftConfig {
  return { ...config, prompts: prompts.map((p) => ({ ...p })) };
}

export function withResources(config: DriftConfig, resources: DriftResource[]): DriftConfig {
  return { ...config, resources: resources.map((r) => ({ ...r })) };
}

export function withResourceTemplates(
  config: DriftConfig,
  templates: DriftResourceTemplate[]
): DriftConfig {
  return { ...config, resourceTemplates: templates.map((t) => ({ ...t })) };
}

export function withServerInfo(
  config: DriftConfig,
  info: { name: string; version: string }
): DriftConfig {
  return { ...config, serverInfo: { ...info } };
}

export function withProtocolVersion(config: DriftConfig, version: string): DriftConfig {
  return { ...config, protocolVersion: version };
}

export function withInstructions(
  config: DriftConfig,
  instructions: string | undefined
): DriftConfig {
  const result = { ...config };
  if (instructions !== undefined) {
    result.instructions = instructions;
  } else {
    delete result.instructions;
  }
  return result;
}

export function withCapabilities(config: DriftConfig, caps: Record<string, unknown>): DriftConfig {
  return { ...config, capabilities: { ...caps } };
}

// ---------------------------------------------------------------------------
// Pipeline runner
// ---------------------------------------------------------------------------

export async function runPipeline(driftConfig: DriftConfig): Promise<BehavioralBaseline> {
  const serverCommand = `${TSX_PATH} ${TSX_BASE_ARGS.join(' ')}`;

  const client = new MCPClient({
    timeout: 10000,
    startupDelay: 100,
  });

  try {
    await client.connect(TSX_PATH, TSX_BASE_ARGS, {
      DRIFT_CONFIG: JSON.stringify(driftConfig),
    });

    const discovery = await discover(client, serverCommand, []);

    const interviewer = new Interviewer(null, {
      checkMode: true,
      maxQuestionsPerTool: 2,
      parallelTools: false,
      serverCommand,
    });

    const result = await interviewer.interview(client, discovery);
    return createBaseline(result, serverCommand);
  } finally {
    try {
      await client.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}

// ---------------------------------------------------------------------------
// Comparison helper
// ---------------------------------------------------------------------------

export async function runDriftComparison(
  beforeConfig: DriftConfig,
  afterConfig: DriftConfig
): Promise<BehavioralDiff> {
  const before = await runPipeline(beforeConfig);
  const after = await runPipeline(afterConfig);
  return compareBaselines(before, after);
}

export function runDirectComparison(
  before: BehavioralBaseline,
  after: BehavioralBaseline,
  options?: CompareOptions
): BehavioralDiff {
  return compareBaselines(before, after, options);
}

export { compareBaselines };

// ---------------------------------------------------------------------------
// Config builder: toolResponses
// ---------------------------------------------------------------------------

export function withToolResponses(
  config: DriftConfig,
  responses: Record<string, { text: string; isError?: boolean }>
): DriftConfig {
  return { ...config, toolResponses: responses };
}

// ---------------------------------------------------------------------------
// Direct baseline construction for runtime observation tests
// ---------------------------------------------------------------------------

export interface DirectToolOptions {
  name: string;
  description?: string;
  schemaHash?: string;
  inputSchema?: Record<string, unknown>;
  responseFingerprint?: ResponseFingerprint;
  errorPatterns?: ErrorPattern[];
  securityFingerprint?: SecurityFingerprint;
  responseSchemaEvolution?: ResponseSchemaEvolution;
  baselineP50Ms?: number;
  baselineP95Ms?: number;
  baselineP99Ms?: number;
  performanceConfidence?: PerformanceConfidence;
  title?: string;
  outputSchema?: Record<string, unknown>;
  outputSchemaHash?: string;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  execution?: { taskSupport?: string };
}

export interface DirectBaselineOptions {
  version?: string;
  protocolVersion?: string;
  serverName?: string;
  tools?: DirectToolOptions[];
  workflows?: Array<{ id: string; name: string; succeeded: boolean; toolSequence?: string[] }>;
  resources?: ResourceCapability[];
  resourceTemplates?: ResourceTemplateCapability[];
  prompts?: PromptCapability[];
  documentationScore?: DocumentationScoreSummary;
  capabilities?: string[];
}

/**
 * Construct a BehavioralBaseline directly for testing runtime observation drift.
 * Follows the pattern from test/baseline/comparator.test.ts.
 */
export function createDirectBaseline(options: DirectBaselineOptions): BehavioralBaseline {
  const tools: ToolCapability[] = (options.tools || []).map((t) => ({
    name: t.name,
    description: t.description || 'A test tool',
    schemaHash: t.schemaHash || 'hash123',
    inputSchema: t.inputSchema || { type: 'object', properties: {} },
    responseFingerprint: t.responseFingerprint,
    errorPatterns: t.errorPatterns,
    securityFingerprint: t.securityFingerprint,
    responseSchemaEvolution: t.responseSchemaEvolution,
    baselineP50Ms: t.baselineP50Ms,
    baselineP95Ms: t.baselineP95Ms,
    baselineP99Ms: t.baselineP99Ms,
    performanceConfidence: t.performanceConfidence,
    title: t.title,
    outputSchema: t.outputSchema,
    outputSchemaHash: t.outputSchemaHash,
    annotations: t.annotations,
    execution: t.execution,
  }));

  const workflows: WorkflowSignature[] | undefined = options.workflows?.map((w) => ({
    id: w.id,
    name: w.name,
    succeeded: w.succeeded,
    toolSequence: w.toolSequence || [],
  }));

  return {
    version: options.version || '2.0.1',
    metadata: {
      mode: 'check',
      generatedAt: new Date().toISOString(),
      serverCommand: 'npx test-server',
      cliVersion: '2.0.1',
      durationMs: 1000,
      personas: [],
      model: 'none',
    },
    server: {
      name: options.serverName || 'test-server',
      version: '1.0.0',
      protocolVersion: options.protocolVersion || '2025-11-25',
      capabilities: options.capabilities || ['tools'],
    },
    capabilities: {
      tools,
      prompts: options.prompts || [],
      resources: options.resources || [],
      resourceTemplates: options.resourceTemplates,
    },
    interviews: [],
    toolProfiles: [],
    assertions: [],
    summary: 'Direct test baseline',
    hash: 'test-hash',
    workflows,
    documentationScore: options.documentationScore,
  };
}
