import { TIMEOUTS, INTERVIEW, WORKFLOW, PATHS, LLM_DEFAULTS } from '../constants.js';

const WORKFLOW_STEP_TIMEOUT_MS = 5000;

export const CONFIG_DEFAULTS = {
  server: {
    command: '',
    args: [] as string[],
    timeout: TIMEOUTS.DEFAULT,
    transport: 'stdio' as const,
    url: '',
    sessionId: '',
    headers: undefined as Record<string, string> | undefined,
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
    autoGenerate: false,
    stepTimeout: WORKFLOW_STEP_TIMEOUT_MS,
    requireSuccessfulDependencies: true,
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
    },
  },
  check: {
    incremental: false,
    incrementalCacheHours: 168,
    parallel: true,
    parallelWorkers: INTERVIEW.DEFAULT_TOOL_CONCURRENCY,
    performanceThreshold: 10,
    diffFormat: 'text' as const,
    warmupRuns: 0,
    smartTestValues: true,
    statefulTesting: {
      enabled: true,
      maxChainLength: 5,
      shareOutputsBetweenTools: true,
    },
    externalServices: {
      mode: 'skip' as const,
      services: {},
    },
    assertions: {
      enabled: true,
      strict: false,
      infer: true,
    },
    rateLimit: {
      enabled: false,
      requestsPerSecond: 10,
      burstLimit: 20,
      backoffStrategy: 'exponential' as const,
      maxRetries: 3,
    },
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
      minSamples: 10,
      targetConfidence: 'low' as const,
      failOnLowConfidence: false,
    },
    metrics: {
      countValidationAsSuccess: true,
      separateValidationMetrics: true,
    },
  },
  baseline: {
    path: PATHS.DEFAULT_BASELINE_FILE,
    savePath: '.bellwether/bellwether-baseline.json',
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
    url: '',
    sessionId: '',
    headers: undefined as Record<string, string> | undefined,
  },
  registry: {
    limit: 10,
    json: false,
  },
  golden: {
    defaultArgs: '{}',
    mode: 'structural' as const,
    compareFormat: 'text' as const,
    listFormat: 'text' as const,
    normalizeTimestamps: true,
    normalizeUuids: true,
  },
  contract: {
    mode: 'strict' as const,
    format: 'text' as const,
    timeout: TIMEOUTS.DEFAULT,
    failOnViolation: false,
  },
} as const;
