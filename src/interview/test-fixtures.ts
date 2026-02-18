/**
 * Test fixture pattern for matching parameter names.
 */
export interface TestFixturePattern {
  /** Regex pattern to match parameter names */
  match: string;
  /** Value to use for matching parameters */
  value: unknown;
}

/**
 * Test fixtures configuration for customizing generated test values.
 */
export interface TestFixturesConfig {
  /** Custom values for specific parameter names (exact match) */
  parameterValues?: Record<string, unknown>;
  /** Custom values for parameters matching regex patterns */
  patterns?: TestFixturePattern[];
}
