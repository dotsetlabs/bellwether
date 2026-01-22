/**
 * Tests for network utility functions.
 */

import { describe, it, expect } from 'vitest';
import { isLocalhost } from '../../src/utils/network.js';
import { CLI_SECURITY } from '../../src/constants.js';

describe('isLocalhost', () => {
  describe('standard localhost values', () => {
    it('should return true for "localhost"', () => {
      expect(isLocalhost('localhost')).toBe(true);
    });

    it('should return true for "127.0.0.1"', () => {
      expect(isLocalhost('127.0.0.1')).toBe(true);
    });

    it('should return true for "::1" (IPv6 localhost)', () => {
      expect(isLocalhost('::1')).toBe(true);
    });

    it('should return false for "[::1]" (bracketed IPv6 not in LOCALHOST_HOSTS)', () => {
      // CLI_SECURITY.LOCALHOST_HOSTS contains '::1' but not '[::1]'
      expect(isLocalhost('[::1]')).toBe(false);
    });
  });

  describe('non-localhost values', () => {
    it('should return false for external hostname', () => {
      expect(isLocalhost('example.com')).toBe(false);
    });

    it('should return false for external IP', () => {
      expect(isLocalhost('192.168.1.1')).toBe(false);
    });

    it('should return false for "0.0.0.0"', () => {
      expect(isLocalhost('0.0.0.0')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isLocalhost('')).toBe(false);
    });

    it('should return false for subdomain of localhost', () => {
      expect(isLocalhost('sub.localhost')).toBe(false);
    });

    it('should return false for localhost-like strings', () => {
      expect(isLocalhost('localhost.com')).toBe(false);
      expect(isLocalhost('mylocalhost')).toBe(false);
    });
  });

  describe('case sensitivity', () => {
    it('should be case-sensitive (LOCALHOST is not localhost)', () => {
      // This depends on CLI_SECURITY.LOCALHOST_HOSTS contents
      // If it only contains lowercase, uppercase should fail
      const result = isLocalhost('LOCALHOST');
      // Check against actual constant
      expect(result).toBe((CLI_SECURITY.LOCALHOST_HOSTS as readonly string[]).includes('LOCALHOST'));
    });

    it('should be case-sensitive (LocalHost is not localhost)', () => {
      const result = isLocalhost('LocalHost');
      expect(result).toBe((CLI_SECURITY.LOCALHOST_HOSTS as readonly string[]).includes('LocalHost'));
    });
  });

  describe('edge cases', () => {
    it('should handle strings with whitespace', () => {
      expect(isLocalhost(' localhost')).toBe(false);
      expect(isLocalhost('localhost ')).toBe(false);
      expect(isLocalhost(' localhost ')).toBe(false);
    });

    it('should handle strings with special characters', () => {
      expect(isLocalhost('localhost\n')).toBe(false);
      expect(isLocalhost('localhost\t')).toBe(false);
    });
  });

  describe('alignment with CLI_SECURITY constant', () => {
    it('should return true for all values in LOCALHOST_HOSTS', () => {
      for (const host of CLI_SECURITY.LOCALHOST_HOSTS) {
        expect(isLocalhost(host)).toBe(true);
      }
    });

    it('should have at least the standard localhost values', () => {
      expect(CLI_SECURITY.LOCALHOST_HOSTS).toContain('localhost');
      expect(CLI_SECURITY.LOCALHOST_HOSTS).toContain('127.0.0.1');
    });
  });
});
