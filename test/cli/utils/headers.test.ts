import { describe, expect, it } from 'vitest';
import { mergeHeaders, parseCliHeaders } from '../../../src/cli/utils/headers.js';

describe('cli/utils/headers', () => {
  describe('parseCliHeaders', () => {
    it('returns undefined for empty input', () => {
      expect(parseCliHeaders()).toBeUndefined();
      expect(parseCliHeaders([])).toBeUndefined();
    });

    it('parses valid header values', () => {
      const headers = parseCliHeaders([
        'Authorization: Bearer token-123',
        'X-API-Key: abc',
      ]);

      expect(headers).toEqual({
        Authorization: 'Bearer token-123',
        'X-API-Key': 'abc',
      });
    });

    it('uses last value for case-insensitive duplicate names', () => {
      const headers = parseCliHeaders([
        'authorization: Bearer old',
        'Authorization: Bearer new',
      ]);

      expect(headers).toEqual({
        Authorization: 'Bearer new',
      });
    });

    it('throws for missing ":" separator', () => {
      expect(() => parseCliHeaders(['Authorization Bearer token'])).toThrow('Invalid header');
    });

    it('throws for invalid header name', () => {
      expect(() => parseCliHeaders(['Auth(orization): token'])).toThrow('Invalid header name');
    });

    it('throws when value contains newline characters', () => {
      expect(() => parseCliHeaders(['Authorization: Bearer token\nx'])).toThrow(
        'cannot contain newlines'
      );
    });
  });

  describe('mergeHeaders', () => {
    it('returns undefined when both sources are undefined', () => {
      expect(mergeHeaders(undefined, undefined)).toBeUndefined();
    });

    it('merges config headers with CLI headers using case-insensitive override precedence', () => {
      const merged = mergeHeaders(
        {
          authorization: 'Bearer config',
          'X-Region': 'us-east-1',
        },
        {
          Authorization: 'Bearer cli',
          'x-extra': '1',
        }
      );

      expect(merged).toEqual({
        Authorization: 'Bearer cli',
        'X-Region': 'us-east-1',
        'x-extra': '1',
      });
    });
  });
});
