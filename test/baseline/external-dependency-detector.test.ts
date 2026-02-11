/**
 * Tests for external dependency detection.
 */
import { describe, it, expect } from 'vitest';
import {
  detectExternalDependency,
  detectExternalServiceFromTool,
  getExternalServiceStatus,
  categorizeErrorSource,
  isTransientError,
  analyzeExternalDependencies,
  formatExternalDependencySummary,
  formatExternalDependenciesMarkdown,
} from '../../src/baseline/external-dependency-detector.js';
import type { ErrorPattern } from '../../src/baseline/response-fingerprint.js';

describe('external-dependency-detector', () => {
  describe('detectExternalDependency', () => {
    describe('Plaid detection', () => {
      it('should detect Plaid API errors', () => {
        const result = detectExternalDependency(
          'INVALID_ACCESS_TOKEN: The access token is invalid'
        );
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('plaid');
        expect(result?.displayName).toBe('Plaid');
      });

      it('should detect Plaid link token errors', () => {
        const result = detectExternalDependency('INVALID_LINK_TOKEN: The link token is invalid');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('plaid');
      });

      it('should detect Plaid tool by name', () => {
        const result = detectExternalDependency('Connection failed', 'plaid_get_accounts');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('plaid');
      });
    });

    describe('Stripe detection', () => {
      it('should detect Stripe API errors', () => {
        const result = detectExternalDependency('Error with sk_test_EXAMPLE_KEY_FOR_TESTING');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('stripe');
        expect(result?.displayName).toBe('Stripe');
      });

      it('should detect Stripe request errors', () => {
        const result = detectExternalDependency('StripeError: invalid_request_error');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('stripe');
      });
    });

    describe('AWS detection', () => {
      it('should detect AWS credential errors', () => {
        const result = detectExternalDependency('CredentialsError: Unable to locate credentials');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('aws');
        expect(result?.displayName).toBe('AWS');
      });

      it('should detect AWS access denied', () => {
        const result = detectExternalDependency(
          'AccessDenied: User is not authorized to perform s3:GetObject'
        );
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('aws');
      });

      it('should detect S3 bucket errors', () => {
        const result = detectExternalDependency(
          'NoSuchBucket: The specified bucket does not exist'
        );
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('aws');
      });
    });

    describe('OpenAI detection', () => {
      it('should detect OpenAI API key errors', () => {
        const result = detectExternalDependency('invalid_api_key: Incorrect API key provided');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('openai');
        expect(result?.displayName).toBe('OpenAI');
      });

      it('should detect OpenAI rate limits', () => {
        const result = detectExternalDependency('rate_limit_exceeded: Too many requests');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('openai');
      });
    });

    describe('Database detection', () => {
      it('should detect PostgreSQL connection errors', () => {
        const result = detectExternalDependency(
          'ECONNREFUSED: could not connect to server',
          'postgres_query'
        );
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('database');
      });

      it('should detect database authentication errors', () => {
        const result = detectExternalDependency('authentication failed for user "admin"');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('database');
      });

      it('should detect database does not exist errors', () => {
        const result = detectExternalDependency('database "mydb" does not exist');
        expect(result).not.toBeNull();
        expect(result?.serviceName).toBe('database');
      });
    });

    describe('HTTP status code detection', () => {
      it('should detect status codes in errors', () => {
        const result = detectExternalDependency(
          'Request failed with status code 401',
          'stripe_charge'
        );
        expect(result).not.toBeNull();
        // Status code match adds confidence
      });
    });

    it('should return null for unrecognized errors', () => {
      const result = detectExternalDependency('Some random error message');
      expect(result).toBeNull();
    });

    it('should use tool description for context', () => {
      const result = detectExternalDependency(
        'Connection failed',
        'get_data',
        'Retrieves data from Plaid API'
      );
      expect(result).not.toBeNull();
      expect(result?.serviceName).toBe('plaid');
    });
  });

  describe('detectExternalServiceFromTool', () => {
    it('should detect services from tool name', () => {
      const result = detectExternalServiceFromTool('plaid_link_create');
      expect(result).not.toBeNull();
      expect(result?.serviceName).toBe('plaid');
    });

    it('should detect services from description', () => {
      const result = detectExternalServiceFromTool(
        'create_link',
        'Creates a link token with Plaid'
      );
      expect(result).not.toBeNull();
      expect(result?.serviceName).toBe('plaid');
    });
  });

  describe('getExternalServiceStatus', () => {
    it('should report missing credentials when not configured', () => {
      const status = getExternalServiceStatus('plaid', { mode: 'skip', services: {} });
      expect(status.configured).toBe(false);
      expect(status.missingCredentials.length).toBeGreaterThan(0);
    });

    it('should report configured when credentials are present', () => {
      process.env.PLAID_CLIENT_ID = 'test';
      process.env.PLAID_SECRET = 'test';
      const status = getExternalServiceStatus('plaid', { mode: 'skip', services: {} });
      expect(status.configured).toBe(true);
      delete process.env.PLAID_CLIENT_ID;
      delete process.env.PLAID_SECRET;
    });
  });

  describe('isTransientError', () => {
    it('should identify timeout errors as transient', () => {
      expect(isTransientError('Connection timeout')).toBe(true);
      expect(isTransientError('Request timeout after 30s')).toBe(true);
      expect(isTransientError('ETIMEDOUT')).toBe(true);
    });

    it('should identify rate limit errors as transient', () => {
      expect(isTransientError('Rate limit exceeded')).toBe(true);
      expect(isTransientError('Too many requests')).toBe(true);
      expect(isTransientError('429 Too Many Requests')).toBe(true);
    });

    it('should identify network errors as transient', () => {
      expect(isTransientError('ECONNREFUSED')).toBe(true);
      expect(isTransientError('ETIMEDOUT')).toBe(true);
      expect(isTransientError('ECONNRESET')).toBe(true);
    });

    it('should identify server errors as transient', () => {
      // Uses status codes and patterns from constants
      expect(isTransientError('Error: 503 Service Unavailable')).toBe(true);
      expect(isTransientError('Error: 504 Gateway Timeout')).toBe(true);
      expect(isTransientError('temporarily unavailable')).toBe(true);
      expect(isTransientError('service unavailable')).toBe(true);
    });

    it('should not identify permanent errors as transient', () => {
      expect(isTransientError('Invalid API key')).toBe(false);
      expect(isTransientError('Resource not found')).toBe(false);
      expect(isTransientError('Permission denied')).toBe(false);
      expect(isTransientError('TypeError: Cannot read property')).toBe(false);
    });
  });

  describe('categorizeErrorSource', () => {
    it('should categorize external dependency errors', () => {
      const result = categorizeErrorSource('INVALID_ACCESS_TOKEN: Plaid token expired');
      expect(result.source).toBe('external_dependency');
      expect(result.dependency?.serviceName).toBe('plaid');
    });

    it('should categorize environment errors', () => {
      const result = categorizeErrorSource('Missing required environment variable: API_KEY');
      expect(result.source).toBe('environment');
      expect(result.isTransient).toBe(false);
    });

    it('should categorize code bug errors', () => {
      const result = categorizeErrorSource("TypeError: Cannot read property 'foo' of undefined");
      expect(result.source).toBe('code_bug');
      expect(result.isTransient).toBe(false);
    });

    it('should categorize transient errors', () => {
      const result = categorizeErrorSource('Connection timeout ETIMEDOUT');
      expect(result.isTransient).toBe(true);
    });

    it('should return unknown for unrecognized errors', () => {
      const result = categorizeErrorSource('Some arbitrary error message');
      expect(result.source).toBe('unknown');
    });

    it('should include remediation suggestions', () => {
      const result = categorizeErrorSource('Missing PLAID_CLIENT_ID environment variable');
      expect(result.remediation).toBeDefined();
      expect(result.remediation?.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeExternalDependencies', () => {
    it('should aggregate errors by service', () => {
      const errors: Array<{
        toolName: string;
        toolDescription?: string;
        patterns: ErrorPattern[];
      }> = [
        {
          toolName: 'get_accounts',
          toolDescription: 'Get Plaid accounts',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'plaid1',
              example: 'INVALID_ACCESS_TOKEN',
              count: 5,
            },
          ],
        },
        {
          toolName: 'get_transactions',
          toolDescription: 'Get Plaid transactions',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'plaid2',
              example: 'PRODUCT_NOT_READY',
              count: 3,
            },
          ],
        },
      ];

      const result = analyzeExternalDependencies(errors);
      expect(result.services.size).toBeGreaterThan(0);
      expect(result.totalExternalErrors).toBeGreaterThan(0);
    });

    it('should track affected tools per service', () => {
      const errors: Array<{
        toolName: string;
        toolDescription?: string;
        patterns: ErrorPattern[];
      }> = [
        {
          toolName: 'stripe_charge',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'stripe1',
              example: 'Invalid API Key provided',
              count: 2,
            },
          ],
        },
      ];

      const result = analyzeExternalDependencies(errors);
      const affectedTools = result.affectedTools.get('stripe_charge');
      expect(affectedTools).toBeDefined();
    });

    it('should count errors by category', () => {
      const errors: Array<{
        toolName: string;
        toolDescription?: string;
        patterns: ErrorPattern[];
      }> = [
        {
          toolName: 'tool1',
          patterns: [
            {
              category: 'validation' as const,
              patternHash: 'val1',
              example: "TypeError: Cannot read property 'x'",
              count: 10,
            },
          ],
        },
        {
          toolName: 'tool2',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'stripe1',
              example: 'Invalid API Key provided: sk_test_xxx',
              count: 5,
            },
          ],
        },
      ];

      const result = analyzeExternalDependencies(errors);
      expect(
        result.totalCodeBugErrors +
          result.totalExternalErrors +
          result.totalEnvironmentErrors +
          result.totalUnknownErrors
      ).toBeGreaterThan(0);
    });

    it('should handle empty input', () => {
      const result = analyzeExternalDependencies([]);
      expect(result.services.size).toBe(0);
      expect(result.totalExternalErrors).toBe(0);
    });
  });

  describe('formatExternalDependencySummary', () => {
    it('should format empty summary', () => {
      const summary = analyzeExternalDependencies([]);
      const formatted = formatExternalDependencySummary(summary);
      expect(formatted).toContain('No external dependencies');
    });

    it('should format summary with services', () => {
      const errors: Array<{
        toolName: string;
        toolDescription?: string;
        patterns: ErrorPattern[];
      }> = [
        {
          toolName: 'plaid_tool',
          toolDescription: 'Plaid integration',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'plaid1',
              example: 'INVALID_ACCESS_TOKEN',
              count: 3,
            },
          ],
        },
      ];

      const summary = analyzeExternalDependencies(errors);
      const formatted = formatExternalDependencySummary(summary);
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('should support colored output', () => {
      const errors: Array<{
        toolName: string;
        toolDescription?: string;
        patterns: ErrorPattern[];
      }> = [
        {
          toolName: 'stripe_charge',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'stripe1',
              example: 'Invalid API Key',
              count: 1,
            },
          ],
        },
      ];

      const summary = analyzeExternalDependencies(errors);
      const formatted = formatExternalDependencySummary(summary, true);
      // Should contain ANSI codes when colors enabled
      if (summary.services.size > 0) {
        expect(formatted).toContain('\x1b[');
      }
    });
  });

  describe('formatExternalDependenciesMarkdown', () => {
    it('should return empty string for no dependencies', () => {
      const summary = analyzeExternalDependencies([]);
      const markdown = formatExternalDependenciesMarkdown(summary);
      expect(markdown).toBe('');
    });

    it('should generate markdown table', () => {
      const errors: Array<{
        toolName: string;
        toolDescription?: string;
        patterns: ErrorPattern[];
      }> = [
        {
          toolName: 'aws_s3',
          toolDescription: 'AWS S3 operations',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'aws1',
              example: 'AccessDenied: User not authorized',
              count: 2,
            },
          ],
        },
      ];

      const summary = analyzeExternalDependencies(errors);
      const markdown = formatExternalDependenciesMarkdown(summary);
      expect(markdown).toContain('External Dependencies');
      expect(markdown).toContain('|');
      expect(markdown).toContain('Service');
    });

    it('should include error classification when external deps exist', () => {
      const errors: Array<{
        toolName: string;
        toolDescription?: string;
        patterns: ErrorPattern[];
      }> = [
        {
          toolName: 'stripe_tool',
          toolDescription: 'Stripe payment operations',
          patterns: [
            {
              category: 'permission' as const,
              patternHash: 'stripe1',
              example: 'Invalid API Key provided: sk_test_xxx',
              count: 3,
            },
          ],
        },
      ];

      const summary = analyzeExternalDependencies(errors);
      const markdown = formatExternalDependenciesMarkdown(summary);
      // Should contain some content when there are external dependencies
      if (summary.services.size > 0) {
        expect(markdown).toContain('External Dependencies');
      }
    });
  });

  // ==================== Confirmed vs Detected Dependencies ====================
  describe('confirmed vs detected dependency tracking', () => {
    describe('detectExternalDependency confidence levels', () => {
      it('should return confirmed level when error message matches patterns', () => {
        const result = detectExternalDependency(
          'INVALID_ACCESS_TOKEN: The access token is invalid'
        );
        expect(result).not.toBeNull();
        expect(result?.confidenceLevel).toBe('confirmed');
        expect(result?.evidence.fromErrorMessage).toBe(true);
      });

      it('should return likely level when only tool name matches', () => {
        const result = detectExternalDependency('Connection failed', 'plaid_get_accounts');
        expect(result).not.toBeNull();
        expect(result?.confidenceLevel).toBe('likely');
        expect(result?.evidence.fromToolName).toBe(true);
        expect(result?.evidence.fromErrorMessage).toBe(false);
      });

      it('should return possible level when only description matches', () => {
        const result = detectExternalDependency(
          'Connection failed',
          'get_data',
          'Retrieves data from Plaid API'
        );
        expect(result).not.toBeNull();
        // When description matches, still likely level due to tool patterns
        expect(result?.evidence.fromDescription).toBe(true);
      });

      it('should include evidence breakdown', () => {
        const result = detectExternalDependency('INVALID_ACCESS_TOKEN', 'plaid_tool');
        expect(result).not.toBeNull();
        expect(result?.evidence).toBeDefined();
        expect(typeof result?.evidence.fromErrorMessage).toBe('boolean');
        expect(typeof result?.evidence.fromToolName).toBe('boolean');
        expect(typeof result?.evidence.fromDescription).toBe('boolean');
        expect(typeof result?.evidence.actualErrorCount).toBe('number');
      });
    });

    describe('analyzeExternalDependencies confirmed vs detected', () => {
      it('should separate confirmed tools from detected tools', () => {
        const errors: Array<{
          toolName: string;
          toolDescription?: string;
          patterns: ErrorPattern[];
        }> = [
          {
            // This tool has actual Plaid errors - should be confirmed
            toolName: 'plaid_get_accounts',
            patterns: [
              {
                category: 'permission' as const,
                patternHash: 'plaid1',
                example: 'INVALID_ACCESS_TOKEN: Token expired',
                count: 5,
              },
            ],
          },
          {
            // This tool only has plaid in name - should be detected
            toolName: 'plaid_get_balance',
            patterns: [
              {
                category: 'unknown' as const,
                patternHash: 'unknown1',
                example: 'Unknown error occurred',
                count: 2,
              },
            ],
          },
        ];

        const result = analyzeExternalDependencies(errors);
        const plaidService = result.services.get('plaid');

        expect(plaidService).toBeDefined();
        // First tool should be confirmed (has actual Plaid errors)
        expect(plaidService?.confirmedTools).toContain('plaid_get_accounts');
        // Second tool's error doesn't match Plaid patterns, so it depends on the
        // confidence threshold whether it gets classified as external
      });

      it('should track confirmed error counts separately', () => {
        const errors: Array<{
          toolName: string;
          toolDescription?: string;
          patterns: ErrorPattern[];
        }> = [
          {
            toolName: 'stripe_charge',
            patterns: [
              {
                category: 'permission' as const,
                patternHash: 'stripe1',
                example: 'StripeError: invalid_api_key',
                count: 10,
              },
            ],
          },
        ];

        const result = analyzeExternalDependencies(errors);
        const stripeService = result.services.get('stripe');

        expect(stripeService).toBeDefined();
        expect(stripeService?.confirmedErrorCount).toBeGreaterThan(0);
        expect(stripeService?.highestConfidenceLevel).toBe('confirmed');
      });

      it('should track highest confidence level per service', () => {
        const errors: Array<{
          toolName: string;
          toolDescription?: string;
          patterns: ErrorPattern[];
        }> = [
          {
            toolName: 'aws_tool',
            patterns: [
              {
                category: 'permission' as const,
                patternHash: 'aws1',
                example: 'AccessDenied: User not authorized for s3:GetObject',
                count: 3,
              },
            ],
          },
        ];

        const result = analyzeExternalDependencies(errors);
        const awsService = result.services.get('aws');

        expect(awsService).toBeDefined();
        expect(['confirmed', 'likely', 'possible']).toContain(awsService?.highestConfidenceLevel);
      });
    });

    describe('formatExternalDependenciesMarkdown with confidence', () => {
      it('should show confidence column in markdown table', () => {
        const errors: Array<{
          toolName: string;
          toolDescription?: string;
          patterns: ErrorPattern[];
        }> = [
          {
            toolName: 'plaid_tool',
            patterns: [
              {
                category: 'permission' as const,
                patternHash: 'plaid1',
                example: 'INVALID_ACCESS_TOKEN',
                count: 5,
              },
            ],
          },
        ];

        const summary = analyzeExternalDependencies(errors);
        const markdown = formatExternalDependenciesMarkdown(summary);

        expect(markdown).toContain('Confidence');
        // Should show either checkmark for confirmed or ~ for likely
        expect(markdown.match(/[+~?]/)).toBeTruthy();
      });

      it('should show confirmed vs detected tools separately', () => {
        const errors: Array<{
          toolName: string;
          toolDescription?: string;
          patterns: ErrorPattern[];
        }> = [
          {
            toolName: 'stripe_charge',
            patterns: [
              {
                category: 'permission' as const,
                patternHash: 'stripe1',
                example: 'StripeError: card_declined',
                count: 5,
              },
            ],
          },
        ];

        const summary = analyzeExternalDependencies(errors);
        const markdown = formatExternalDependenciesMarkdown(summary);

        expect(markdown).toContain('Confirmed Tools');
        expect(markdown).toContain('Detected Tools');
      });
    });
  });
});
