/**
 * Tests for enhanced error analysis functionality.
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeError,
  analyzeErrorPatterns,
  generateErrorSummary,
  analyzeErrorTrends,
  extractHttpStatus,
  categorizeHttpStatus,
  inferRootCause,
  generateRemediation,
  extractRelatedParameters,
  isTransientError,
  assessErrorSeverity,
  mapStatusToErrorCategory,
  formatEnhancedError,
  formatErrorTrendReport,
  formatCategoryName,
} from '../../src/baseline/error-analyzer.js';
import type { ErrorPattern } from '../../src/baseline/response-fingerprint.js';

describe('error-analyzer', () => {
  // ==================== HTTP Status Extraction ====================
  describe('extractHttpStatus', () => {
    it('should extract status code from "status code 400" format', () => {
      expect(extractHttpStatus('Request failed with status code 400')).toBe(400);
      expect(extractHttpStatus('status code: 404')).toBe(404);
      expect(extractHttpStatus('status code 500')).toBe(500);
    });

    it('should extract status code from "HTTP 404" format', () => {
      expect(extractHttpStatus('HTTP 404 Not Found')).toBe(404);
      expect(extractHttpStatus('HTTP/1.1 500 Internal Server Error')).toBe(500);
    });

    it('should extract status code from "Error 400" format', () => {
      expect(extractHttpStatus('Error 400: Bad Request')).toBe(400);
      expect(extractHttpStatus('Error 403 Forbidden')).toBe(403);
    });

    it('should extract status code from bracketed format', () => {
      expect(extractHttpStatus('[404] Not found')).toBe(404);
      expect(extractHttpStatus('(500) Server error')).toBe(500);
    });

    it('should extract status code with contextual keywords', () => {
      expect(extractHttpStatus('400 bad request')).toBe(400);
      expect(extractHttpStatus('404 not found')).toBe(404);
      expect(extractHttpStatus('500 internal error')).toBe(500);
    });

    it('should return undefined when no status code found', () => {
      expect(extractHttpStatus('Something went wrong')).toBeUndefined();
      expect(extractHttpStatus('Connection refused')).toBeUndefined();
    });

    it('should ignore numbers that are not HTTP status codes', () => {
      expect(extractHttpStatus('Error in line 12345')).toBeUndefined();
      expect(extractHttpStatus('Timeout after 30000ms')).toBeUndefined();
    });
  });

  // ==================== HTTP Status Categorization ====================
  describe('categorizeHttpStatus', () => {
    it('should categorize 400 as validation error', () => {
      expect(categorizeHttpStatus(400)).toBe('client_error_validation');
    });

    it('should categorize 401 and 403 as auth errors', () => {
      expect(categorizeHttpStatus(401)).toBe('client_error_auth');
      expect(categorizeHttpStatus(403)).toBe('client_error_auth');
    });

    it('should categorize 404 as not found', () => {
      expect(categorizeHttpStatus(404)).toBe('client_error_not_found');
    });

    it('should categorize 409 as conflict', () => {
      expect(categorizeHttpStatus(409)).toBe('client_error_conflict');
    });

    it('should categorize 429 as rate limit', () => {
      expect(categorizeHttpStatus(429)).toBe('client_error_rate_limit');
    });

    it('should categorize 5xx as server error', () => {
      expect(categorizeHttpStatus(500)).toBe('server_error');
      expect(categorizeHttpStatus(502)).toBe('server_error');
      expect(categorizeHttpStatus(503)).toBe('server_error');
    });

    it('should categorize other 4xx as validation error', () => {
      expect(categorizeHttpStatus(405)).toBe('client_error_validation');
      expect(categorizeHttpStatus(422)).toBe('client_error_validation');
    });

    it('should return unknown for undefined status', () => {
      expect(categorizeHttpStatus(undefined)).toBe('unknown');
    });
  });

  // ==================== Root Cause Inference ====================
  describe('inferRootCause', () => {
    it('should infer missing required parameter', () => {
      expect(inferRootCause("'email' is required", 'client_error_validation'))
        .toContain('Required parameter "email"');
    });

    it('should infer missing field', () => {
      expect(inferRootCause('missing field "username"', 'client_error_validation'))
        .toContain('Missing required field');
    });

    it('should infer invalid format', () => {
      expect(inferRootCause('Invalid format for date', 'client_error_validation'))
        .toContain('Invalid input format');
    });

    it('should infer invalid type', () => {
      expect(inferRootCause('Invalid type for age', 'client_error_validation'))
        .toContain('Invalid input type');
    });

    it('should infer resource not found', () => {
      expect(inferRootCause('User not found', 'client_error_not_found'))
        .toContain('Referenced resource does not exist');
    });

    it('should infer duplicate resource', () => {
      expect(inferRootCause('Email already exists', 'client_error_conflict'))
        .toContain('Resource already exists');
    });

    it('should infer authentication failure', () => {
      expect(inferRootCause('Unauthorized access', 'client_error_auth'))
        .toContain('Authentication credentials');
    });

    it('should infer permission failure', () => {
      expect(inferRootCause('Permission denied', 'client_error_auth'))
        .toContain('Insufficient permissions');
    });

    it('should infer rate limit', () => {
      expect(inferRootCause('Rate limit exceeded', 'client_error_rate_limit'))
        .toContain('Request rate limit exceeded');
    });

    it('should infer timeout', () => {
      expect(inferRootCause('Request timed out', 'unknown'))
        .toContain('Operation timed out');
    });

    it('should fall back to category-based inference', () => {
      expect(inferRootCause('Unknown error occurred', 'server_error'))
        .toContain('Server-side error');
    });
  });

  // ==================== Remediation Generation ====================
  describe('generateRemediation', () => {
    it('should suggest specific parameter fix for required error', () => {
      const result = generateRemediation('client_error_validation', "'email' is required");
      expect(result).toContain('email');
      expect(result).toContain('parameter');
    });

    it('should suggest format verification for format errors', () => {
      const result = generateRemediation('client_error_validation', 'Invalid format for date');
      expect(result.toLowerCase()).toContain('format');
    });

    it('should suggest type checking for type errors', () => {
      const result = generateRemediation('client_error_validation', 'Invalid type expected number');
      expect(result.toLowerCase()).toContain('type');
    });

    it('should suggest existence check for not found', () => {
      const result = generateRemediation('client_error_not_found', 'Resource not found');
      expect(result.toLowerCase()).toContain('exist');
    });

    it('should suggest upsert for already exists', () => {
      const result = generateRemediation('client_error_conflict', 'Item already exists');
      expect(result.toLowerCase()).toContain('exist');
    });

    it('should suggest timeout handling', () => {
      const result = generateRemediation('server_error', 'Request timeout');
      expect(result.toLowerCase()).toContain('timeout');
    });

    it('should suggest rate limit handling', () => {
      const result = generateRemediation('client_error_rate_limit', 'Too many requests');
      expect(result.toLowerCase()).toContain('backoff');
    });

    it('should fall back to category-based remediation', () => {
      expect(generateRemediation('client_error_auth', 'Some auth error'))
        .toContain('authentication');
    });
  });

  // ==================== Parameter Extraction ====================
  describe('extractRelatedParameters', () => {
    it('should extract quoted parameter names', () => {
      const params = extractRelatedParameters("Parameter 'email' is required");
      expect(params).toContain('email');
    });

    it('should extract parameters from field pattern', () => {
      const params = extractRelatedParameters('Invalid field username');
      expect(params).toContain('username');
    });

    it('should extract multiple parameters', () => {
      const params = extractRelatedParameters("'email' and 'password' are required");
      expect(params).toContain('email');
      expect(params).toContain('password');
    });

    it('should filter out common words', () => {
      const params = extractRelatedParameters("The 'email' field is required");
      expect(params).toContain('email');
      expect(params).not.toContain('the');
      expect(params).not.toContain('field');
    });

    it('should return empty array when no parameters found', () => {
      const params = extractRelatedParameters('Something went wrong');
      expect(params).toHaveLength(0);
    });
  });

  // ==================== Transient Error Detection ====================
  describe('isTransientError', () => {
    it('should identify rate limit as transient', () => {
      expect(isTransientError('client_error_rate_limit', 'Too many requests')).toBe(true);
    });

    it('should identify server error as transient', () => {
      expect(isTransientError('server_error', 'Internal server error')).toBe(true);
    });

    it('should identify timeout as transient', () => {
      expect(isTransientError('unknown', 'Request timed out')).toBe(true);
    });

    it('should identify network issues as transient', () => {
      expect(isTransientError('unknown', 'Connection refused')).toBe(true);
      expect(isTransientError('unknown', 'Network error')).toBe(true);
    });

    it('should identify unavailable as transient', () => {
      expect(isTransientError('unknown', 'Service unavailable')).toBe(true);
      expect(isTransientError('unknown', 'Under maintenance')).toBe(true);
    });

    it('should not identify validation errors as transient', () => {
      expect(isTransientError('client_error_validation', 'Invalid email')).toBe(false);
    });

    it('should not identify auth errors as transient', () => {
      expect(isTransientError('client_error_auth', 'Invalid token')).toBe(false);
    });
  });

  // ==================== Severity Assessment ====================
  describe('assessErrorSeverity', () => {
    it('should classify fatal errors as critical', () => {
      expect(assessErrorSeverity('unknown', 'Fatal error occurred')).toBe('critical');
    });

    it('should classify server errors as high', () => {
      expect(assessErrorSeverity('server_error', 'Internal server error')).toBe('high');
    });

    it('should classify auth errors as high', () => {
      expect(assessErrorSeverity('client_error_auth', 'Unauthorized')).toBe('high');
    });

    it('should classify validation errors as medium', () => {
      expect(assessErrorSeverity('client_error_validation', 'Invalid input')).toBe('medium');
    });

    it('should classify not found as low', () => {
      expect(assessErrorSeverity('client_error_not_found', 'Resource not found')).toBe('low');
    });

    it('should classify rate limit as low', () => {
      expect(assessErrorSeverity('client_error_rate_limit', 'Too many requests')).toBe('low');
    });

    it('should default to info for unknown', () => {
      expect(assessErrorSeverity('unknown', 'Something happened')).toBe('info');
    });
  });

  // ==================== Error Analysis ====================
  describe('analyzeError', () => {
    it('should produce complete analysis for HTTP error', () => {
      const analysis = analyzeError('Error 404: User not found');

      expect(analysis.httpStatus).toBe(404);
      expect(analysis.statusCategory).toBe('client_error_not_found');
      expect(analysis.rootCause).toBeTruthy();
      expect(analysis.remediation).toBeTruthy();
      expect(analysis.transient).toBe(false);
      expect(analysis.severity).toBe('low');
    });

    it('should handle messages without HTTP status', () => {
      const analysis = analyzeError('Invalid email format');

      expect(analysis.httpStatus).toBeUndefined();
      expect(analysis.statusCategory).toBe('unknown');
      expect(analysis.rootCause).toBeTruthy();
    });
  });

  describe('analyzeErrorPatterns', () => {
    it('should analyze multiple error patterns', () => {
      const patterns: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400: Invalid email', count: 3 },
        { category: 'not_found', patternHash: 'b', example: 'HTTP 404 Not Found', count: 2 },
      ];

      const analyses = analyzeErrorPatterns(patterns);

      expect(analyses).toHaveLength(2);
      expect(analyses[0].httpStatus).toBe(400);
      expect(analyses[0].pattern).toBe(patterns[0]);
      expect(analyses[1].httpStatus).toBe(404);
    });
  });

  // ==================== Error Summary ====================
  describe('generateErrorSummary', () => {
    it('should generate comprehensive summary', () => {
      const patterns: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: "Error 400: 'email' is required", count: 5 },
        { category: 'validation', patternHash: 'b', example: 'Error 400: Invalid format', count: 3 },
        { category: 'not_found', patternHash: 'c', example: 'Error 404: User not found', count: 2 },
      ];

      const summary = generateErrorSummary('test_tool', patterns);

      expect(summary.tool).toBe('test_tool');
      expect(summary.totalErrors).toBe(10);
      expect(summary.analyses).toHaveLength(3);
      expect(summary.dominantCategory).toBe('client_error_validation');
      expect(summary.categoryCounts.get('client_error_validation')).toBe(8);
      expect(summary.categoryCounts.get('client_error_not_found')).toBe(2);
      expect(summary.topRemediations.length).toBeGreaterThan(0);
      expect(summary.topRootCauses.length).toBeGreaterThan(0);
    });

    it('should handle empty patterns', () => {
      const summary = generateErrorSummary('test_tool', []);

      expect(summary.totalErrors).toBe(0);
      expect(summary.analyses).toHaveLength(0);
      expect(summary.dominantCategory).toBe('unknown');
    });

    it('should count transient errors correctly', () => {
      const patterns: ErrorPattern[] = [
        { category: 'internal', patternHash: 'a', example: 'HTTP 500 Internal Server Error', count: 3 },
        { category: 'validation', patternHash: 'b', example: 'Error 400: Invalid input', count: 2 },
      ];

      const summary = generateErrorSummary('test_tool', patterns);

      expect(summary.transientErrors).toBe(3);
    });

    it('should extract related parameters', () => {
      const patterns: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: "Field 'email' is required", count: 1 },
        { category: 'validation', patternHash: 'b', example: "Parameter 'username' is invalid", count: 1 },
      ];

      const summary = generateErrorSummary('test_tool', patterns);

      expect(summary.relatedParameters).toContain('email');
      expect(summary.relatedParameters).toContain('username');
    });
  });

  // ==================== Error Trend Analysis ====================
  describe('analyzeErrorTrends', () => {
    it('should detect new error categories', () => {
      const previous: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 5 },
      ];
      const current: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 5 },
        { category: 'not_found', patternHash: 'b', example: 'Error 404', count: 3 },
      ];

      const report = analyzeErrorTrends(previous, current);

      expect(report.newCategories).toContain('not_found');
      expect(report.significantChange).toBe(true);
    });

    it('should detect resolved error categories', () => {
      const previous: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 5 },
        { category: 'internal', patternHash: 'b', example: 'Error 500', count: 3 },
      ];
      const current: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 5 },
      ];

      const report = analyzeErrorTrends(previous, current);

      expect(report.resolvedCategories).toContain('internal');
    });

    it('should detect increasing errors', () => {
      const previous: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 2 },
      ];
      const current: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 10 },
      ];

      const report = analyzeErrorTrends(previous, current);

      expect(report.increasingCategories).toContain('validation');
      expect(report.significantChange).toBe(true);
    });

    it('should detect decreasing errors', () => {
      const previous: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 10 },
      ];
      const current: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 2 },
      ];

      const report = analyzeErrorTrends(previous, current);

      expect(report.decreasingCategories).toContain('validation');
    });

    it('should identify stable patterns', () => {
      const previous: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 5 },
      ];
      const current: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400', count: 5 },
      ];

      const report = analyzeErrorTrends(previous, current);

      expect(report.significantChange).toBe(false);
      expect(report.summary).toContain('stable');
    });

    it('should handle empty baselines', () => {
      const report = analyzeErrorTrends([], []);

      expect(report.trends).toHaveLength(0);
      expect(report.significantChange).toBe(false);
    });

    it('should generate summary with all changes', () => {
      const previous: ErrorPattern[] = [
        { category: 'internal', patternHash: 'a', example: 'Old error', count: 5 },
        { category: 'validation', patternHash: 'b', example: 'Growing', count: 2 },
      ];
      const current: ErrorPattern[] = [
        { category: 'permission', patternHash: 'c', example: 'New error', count: 3 },
        { category: 'validation', patternHash: 'b', example: 'Growing', count: 10 },
      ];

      const report = analyzeErrorTrends(previous, current);

      expect(report.summary).toContain('new');
      expect(report.summary).toContain('resolved');
      expect(report.summary).toContain('increasing');
    });
  });

  // ==================== Category Mapping ====================
  describe('mapStatusToErrorCategory', () => {
    it('should map validation errors correctly', () => {
      expect(mapStatusToErrorCategory('client_error_validation')).toBe('validation');
      expect(mapStatusToErrorCategory('client_error_conflict')).toBe('validation');
      expect(mapStatusToErrorCategory('client_error_rate_limit')).toBe('validation');
    });

    it('should map not found correctly', () => {
      expect(mapStatusToErrorCategory('client_error_not_found')).toBe('not_found');
    });

    it('should map auth errors to permission', () => {
      expect(mapStatusToErrorCategory('client_error_auth')).toBe('permission');
    });

    it('should map server errors to internal', () => {
      expect(mapStatusToErrorCategory('server_error')).toBe('internal');
    });

    it('should map unknown correctly', () => {
      expect(mapStatusToErrorCategory('unknown')).toBe('unknown');
    });
  });

  // ==================== Formatting ====================
  describe('formatCategoryName', () => {
    it('should format all categories', () => {
      expect(formatCategoryName('client_error_validation')).toBe('Validation Error');
      expect(formatCategoryName('client_error_auth')).toBe('Authentication Error');
      expect(formatCategoryName('client_error_not_found')).toBe('Not Found');
      expect(formatCategoryName('client_error_conflict')).toBe('Conflict');
      expect(formatCategoryName('client_error_rate_limit')).toBe('Rate Limited');
      expect(formatCategoryName('server_error')).toBe('Server Error');
      expect(formatCategoryName('unknown')).toBe('Unknown Error');
    });
  });

  describe('formatEnhancedError', () => {
    it('should format analysis without colors', () => {
      const analysis = analyzeError('Error 404: User not found');
      const formatted = formatEnhancedError(analysis, false);

      expect(formatted).toContain('Not Found');
      expect(formatted).toContain('HTTP 404');
      expect(formatted).toContain('Cause:');
      expect(formatted).toContain('Fix:');
    });

    it('should include related parameters', () => {
      const analysis = analyzeError("Error 400: Field 'email' is required");
      const formatted = formatEnhancedError(analysis, false);

      expect(formatted).toContain('email');
    });

    it('should indicate transient errors', () => {
      const analysis = analyzeError('HTTP 500 Internal Server Error');
      const formatted = formatEnhancedError(analysis, false);

      expect(formatted).toContain('Transient');
    });
  });

  describe('formatErrorTrendReport', () => {
    it('should format report without colors', () => {
      const previous: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error', count: 2 },
      ];
      const current: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error', count: 10 },
        { category: 'not_found', patternHash: 'b', example: 'Not found', count: 3 },
      ];

      const report = analyzeErrorTrends(previous, current);
      const formatted = formatErrorTrendReport(report, false);

      expect(formatted).toContain('Error Trend Analysis');
      expect(formatted).toContain('not_found');
    });

    it('should handle stable report', () => {
      const patterns: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error', count: 5 },
      ];

      const report = analyzeErrorTrends(patterns, patterns);
      const formatted = formatErrorTrendReport(report, false);

      expect(formatted).toContain('No significant changes');
    });
  });

  // ==================== Validation Expected Category ====================
  describe('validation_expected category', () => {
    it('should format validation_expected category name', () => {
      expect(formatCategoryName('validation_expected')).toBe('Expected Validation (Test)');
    });

    it('should handle validation_expected in analyzeError with context', () => {
      // When an error is expected from validation testing, it should be
      // classified as validation_expected
      const analysis = analyzeError('Error 400: Invalid email format', {
        expectedOutcome: 'error',
        testCategory: 'error_handling',
      });

      // The analysis should recognize this as expected validation
      expect(analysis.statusCategory).toBe('validation_expected');
      expect(analysis.wasExpected).toBe(true);
    });

    it('should mark unexpected errors as not expected', () => {
      const analysis = analyzeError('Error 400: Invalid email format', {
        expectedOutcome: 'success',
        testCategory: 'happy_path',
      });

      // When success was expected but got error, wasExpected is false
      expect(analysis.wasExpected).toBe(false);
      expect(analysis.statusCategory).toBe('client_error_validation');
    });

    it('should handle context with error expected outcome', () => {
      const analysis = analyzeError('Error 404: User not found', {
        expectedOutcome: 'error',
        testCategory: 'error_handling',
      });

      expect(analysis.wasExpected).toBe(true);
      expect(analysis.severity).toBe('info'); // Expected errors are informational
    });

    it('should classify severity as info for expected errors', () => {
      const analysis = analyzeError('Error 400: Required field missing', {
        expectedOutcome: 'error',
        testCategory: 'error_handling',
      });

      // Expected validation errors should have 'info' severity
      expect(analysis.severity).toBe('info');
    });

    it('should use wasExpected flag directly when provided', () => {
      const analysis = analyzeError('Some error message', {
        wasExpected: true,
      });

      expect(analysis.wasExpected).toBe(true);
      expect(analysis.severity).toBe('info');
    });
  });

  describe('analyzeErrorPatterns with context', () => {
    it('should pass context to individual error analysis', () => {
      const patterns: ErrorPattern[] = [
        { category: 'validation', patternHash: 'a', example: 'Error 400: Invalid email', count: 3 },
      ];

      const context = {
        expectedOutcome: 'error' as const,
        testCategory: 'error_handling',
      };

      const analyses = analyzeErrorPatterns(patterns, context);

      expect(analyses).toHaveLength(1);
      expect(analyses[0].wasExpected).toBe(true);
    });
  });
});
