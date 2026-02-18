import type { QuestionCategory } from './question-category.js';

/**
 * Expected outcome for a test question.
 * - 'success': Test expects the tool to execute successfully
 * - 'error': Test expects the tool to reject/fail (validation test)
 * - 'either': Test outcome is acceptable either way
 */
export type ExpectedOutcome = 'success' | 'error' | 'either';

/**
 * A question to ask about a tool's behavior.
 */
export interface InterviewQuestion {
  /** Description of what this question tests */
  description: string;
  /** Category of question */
  category: QuestionCategory;
  /** Arguments to pass to the tool */
  args: Record<string, unknown>;
  /**
   * Expected outcome of this test.
   * Used to determine if the tool behaved correctly.
   * - 'success': Expects successful execution (happy path)
   * - 'error': Expects rejection/error (validation test)
   * - 'either': Either outcome is acceptable
   */
  expectedOutcome?: ExpectedOutcome;
  /** Semantic validation metadata (for tests generated from semantic type inference) */
  metadata?: {
    /** The inferred semantic type being tested */
    semanticType?: string;
    /** Expected behavior: 'reject' for invalid values, 'accept' for valid */
    expectedBehavior?: 'reject' | 'accept';
    /** Confidence level of the semantic type inference (0-1) */
    confidence?: number;
    /** Stateful testing metadata */
    stateful?: {
      /** Keys injected from prior tool outputs */
      usedKeys?: string[];
      /** Keys captured from this response */
      providedKeys?: string[];
    };
    /**
     * Whether this tool uses operation-based dispatch pattern.
     * Tools with this pattern have different required args per operation.
     */
    operationBased?: boolean;
    /** The parameter name that selects the operation (e.g., "operation", "action") */
    operationParam?: string;
    /** The parameter name that holds operation-specific args (e.g., "args", "params") */
    argsParam?: string;
    /**
     * Whether this tool requires prior state (session, chain, etc.).
     * These tools need an active session before they can work.
     */
    selfStateful?: boolean;
    /** Reason for self-stateful detection */
    selfStatefulReason?: string;
    /**
     * Whether this tool has complex array schemas requiring structured data.
     * Simple test data generation often fails for these tools.
     */
    hasComplexArrays?: boolean;
    /** Array parameters with complex item schemas */
    complexArrayParams?: string[];
  };
}

/**
 * Assessment of whether a tool interaction outcome matched expectations.
 */
export interface OutcomeAssessment {
  /** What outcome was expected */
  expected: ExpectedOutcome;
  /** What actually happened */
  actual: 'success' | 'error';
  /** Whether the tool behaved correctly (matches expectation) */
  correct: boolean;
  /** True if this was a validation test that correctly rejected invalid input */
  isValidationSuccess?: boolean;
}
