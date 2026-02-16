import { describe, expect, it } from 'vitest';
import { ServerAuthError } from '../../src/errors/types.js';

describe('errors/types', () => {
  describe('ServerAuthError', () => {
    it('constructs with expected defaults', () => {
      const error = new ServerAuthError('Unauthorized', 401, 'Use Authorization header');

      expect(error.name).toBe('ServerAuthError');
      expect(error.code).toBe('TRANSPORT_AUTH_FAILED');
      expect(error.severity).toBe('high');
      expect(error.retryable).toBe('terminal');
      expect(error.statusCode).toBe(401);
      expect(error.hint).toBe('Use Authorization header');
    });

    it('serializes with code and metadata', () => {
      const error = new ServerAuthError('Forbidden', 403, 'Insufficient permissions');
      const json = error.toJSON();

      expect(json.code).toBe('TRANSPORT_AUTH_FAILED');
      expect(json.message).toContain('Forbidden');
      expect((json.context as { metadata?: Record<string, unknown> }).metadata?.statusCode).toBe(403);
      expect((json.context as { metadata?: Record<string, unknown> }).metadata?.hint).toBe(
        'Insufficient permissions'
      );
    });
  });
});
