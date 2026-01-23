import { TIMEOUTS, INTERVIEW, WORKFLOW, PATHS, LLM_DEFAULTS } from '../constants.js';

const WORKFLOW_STEP_TIMEOUT_MS = 5000;

export const CONFIG_DEFAULTS = {
  server: {
    command: '',
    args: [] as string[],
    timeout: TIMEOUTS.DEFAULT,
  },
  llm: {
    provider: 'ollama' as const,
    model: '',
    ollama: {
      baseUrl: LLM_DEFAULTS.OLLAMA_BASE_URL,
    },
  },
  explore: {
    personas: ['technical_writer'] as const,
    maxQuestionsPerTool: INTERVIEW.MAX_QUESTIONS_PER_TOOL,
    parallelPersonas: false,
    personaConcurrency: INTERVIEW.DEFAULT_PERSONA_CONCURRENCY,
    skipErrorTests: false,
  },
  scenarios: {
    only: false,
  },
  workflows: {
    discover: false,
    trackState: false,
    autoGenerate: true,
    stepTimeout: WORKFLOW_STEP_TIMEOUT_MS,
    timeouts: {
      toolCall: WORKFLOW_STEP_TIMEOUT_MS,
      stateSnapshot: WORKFLOW.STATE_SNAPSHOT_TIMEOUT,
      probeTool: WORKFLOW.PROBE_TOOL_TIMEOUT,
      llmAnalysis: WORKFLOW.LLM_ANALYSIS_TIMEOUT,
      llmSummary: WORKFLOW.LLM_SUMMARY_TIMEOUT,
    },
  },
  output: {
    dir: '.bellwether',
    docsDir: '.',
    format: 'both' as const,
    examples: {
      full: true,
      maxLength: 5000,
      maxPerTool: 5,
    },
    files: {
      checkReport: PATHS.DEFAULT_CHECK_REPORT_FILE,
      exploreReport: PATHS.DEFAULT_EXPLORE_REPORT_FILE,
      contractDoc: PATHS.DEFAULT_CONTRACT_FILE,
      agentsDoc: PATHS.DEFAULT_AGENTS_FILE,
      verificationReport: PATHS.DEFAULT_VERIFICATION_REPORT_FILE,
    },
  },
  check: {
    incremental: false,
    incrementalCacheHours: 168,
    parallel: true,
    parallelWorkers: INTERVIEW.DEFAULT_TOOL_CONCURRENCY,
    performanceThreshold: 10,
    diffFormat: 'text' as const,
    security: {
      enabled: false,
      categories: [
        'sql_injection',
        'xss',
        'path_traversal',
        'command_injection',
        'ssrf',
        'error_disclosure',
      ] as const,
    },
    sampling: {
      minSamples: 3,
      targetConfidence: 'medium' as const,
      failOnLowConfidence: false,
    },
  },
  baseline: {
    path: PATHS.DEFAULT_BASELINE_FILE,
    failOnDrift: false,
    outputFormat: 'text' as const,
    severity: {
      minimumSeverity: 'none' as const,
      failOnSeverity: 'breaking' as const,
      suppressWarnings: false,
    },
  },
  watch: {
    path: '.',
    interval: TIMEOUTS.WATCH_INTERVAL,
    extensions: ['.ts', '.js', '.json', '.py', '.go'] as const,
  },
  cache: {
    enabled: true,
    dir: PATHS.DEFAULT_CACHE_DIR,
  },
  logging: {
    level: 'info' as const,
    verbose: false,
  },
  discovery: {
    json: false,
    timeout: TIMEOUTS.DEFAULT,
    transport: 'stdio' as const,
  },
  registry: {
    limit: 10,
    json: false,
  },
  history: {
    limit: 10,
    json: false,
  },
  link: {
    defaultServerCommand: 'node dist/server.js',
  },
  golden: {
    defaultArgs: '{}',
    mode: 'structural' as const,
    compareFormat: 'text' as const,
    listFormat: 'text' as const,
    normalizeTimestamps: true,
    normalizeUuids: true,
  },
  verify: {
    tier: 'silver' as const,
    security: false,
    json: false,
    badgeOnly: false,
  },
  contract: {
    mode: 'strict' as const,
    format: 'text' as const,
    timeout: TIMEOUTS.DEFAULT,
    failOnViolation: false,
  },
} as const;
