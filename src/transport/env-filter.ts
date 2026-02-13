/**
 * Environment variables to filter out when spawning MCP server processes.
 * These may contain sensitive credentials that should not be exposed.
 */
const FILTERED_ENV_VARS = new Set([
  // LLM API keys
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'COHERE_API_KEY',
  'HUGGINGFACE_API_KEY',
  'REPLICATE_API_TOKEN',
  // Provider credentials
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  // SCM/CI tokens
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'GITLAB_TOKEN',
  'BITBUCKET_TOKEN',
  'NPM_TOKEN',
  'PYPI_TOKEN',
  // Database credentials
  'DATABASE_URL',
  'DATABASE_PASSWORD',
  'POSTGRES_PASSWORD',
  'MYSQL_PASSWORD',
  'REDIS_PASSWORD',
  'MONGODB_URI',
  // Application secrets
  'COOKIE_SECRET',
  'SESSION_SECRET',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'PRIVATE_KEY',
]);

/**
 * Patterns for environment variable names that should be filtered.
 * Matches common naming conventions for secrets.
 */
const FILTERED_ENV_PATTERNS = [
  /_API_KEY$/i,
  /_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_PRIVATE_KEY$/i,
  /_CREDENTIALS$/i,
  /^SECRET_/i,
  /^PRIVATE_/i,
];

function isSensitiveEnvVar(name: string): boolean {
  if (FILTERED_ENV_VARS.has(name)) {
    return true;
  }

  return FILTERED_ENV_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Filter sensitive variables from process.env before spawning subprocesses.
 * Explicitly provided additional environment variables are still allowed.
 */
export function filterSpawnEnv(
  baseEnv: NodeJS.ProcessEnv,
  additionalEnv?: Record<string, string>
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && !isSensitiveEnvVar(key)) {
      filtered[key] = value;
    }
  }

  if (additionalEnv) {
    Object.assign(filtered, additionalEnv);
  }

  return filtered;
}
