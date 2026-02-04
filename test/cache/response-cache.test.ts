import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ResponseCache,
  ToolResponseCache,
  getGlobalCache,
  resetGlobalCache,
} from '../../src/cache/response-cache.js';

describe('ResponseCache', () => {
  let cache: ResponseCache;

  beforeEach(() => {
    cache = new ResponseCache();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', { data: 'test' });
      const result = cache.get<{ data: string }>('key1');
      expect(result).toEqual({ data: 'test' });
    });

    it('should return undefined for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
    });

    it('should delete entries', () => {
      cache.set('key1', 'value');
      expect(cache.has('key1')).toBe(true);

      const deleted = cache.delete('key1');
      expect(deleted).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('key generation', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = cache.generateKey('tool', 'test', { arg: 1 });
      const key2 = cache.generateKey('tool', 'test', { arg: 1 });
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different input', () => {
      const key1 = cache.generateKey('tool', 'test', { arg: 1 });
      const key2 = cache.generateKey('tool', 'test', { arg: 2 });
      expect(key1).not.toBe(key2);
    });

    it('should handle null and undefined', () => {
      const key1 = cache.generateKey('tool', null);
      const key2 = cache.generateKey('tool', undefined);
      expect(key1).not.toBe(key2);
    });
  });

  describe('TTL and expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      cache.set('key1', 'value', { ttlMs: 1000 });
      expect(cache.has('key1')).toBe(true);

      vi.advanceTimersByTime(1500);

      expect(cache.has('key1')).toBe(false);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not expire entries before TTL', () => {
      cache.set('key1', 'value', { ttlMs: 5000 });

      vi.advanceTimersByTime(3000);

      expect(cache.has('key1')).toBe(true);
      expect(cache.get('key1')).toBe('value');
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value');

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should track entry count', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.entries).toBe(2);
    });
  });

  describe('eviction', () => {
    it('should evict entries when max entries exceeded', () => {
      const smallCache = new ResponseCache({ maxEntries: 2 });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3'); // Should evict key1

      expect(smallCache.has('key3')).toBe(true);
      expect(smallCache.has('key2')).toBe(true);
      // key1 should be evicted (oldest)
      expect(smallCache.has('key1')).toBe(false);
    });
  });

  describe('getOrCompute', () => {
    it('should return cached value without computing', async () => {
      cache.set('key1', 'cached');
      const compute = vi.fn().mockResolvedValue('computed');

      const result = await cache.getOrCompute('key1', compute);

      expect(result).toBe('cached');
      expect(compute).not.toHaveBeenCalled();
    });

    it('should compute and cache when not in cache', async () => {
      const compute = vi.fn().mockResolvedValue('computed');

      const result = await cache.getOrCompute('key1', compute);

      expect(result).toBe('computed');
      expect(compute).toHaveBeenCalled();
      expect(cache.get('key1')).toBe('computed');
    });
  });

  describe('disabled cache', () => {
    it('should not cache when disabled', () => {
      const disabledCache = new ResponseCache({ enabled: false });

      disabledCache.set('key1', 'value');
      expect(disabledCache.get('key1')).toBeUndefined();
      expect(disabledCache.has('key1')).toBe(false);
    });

    it('should not create cache directory when disabled', () => {
      const dir = join(tmpdir(), `bellwether-cache-disabled-${Date.now()}`);
      const disabledCache = new ResponseCache({ enabled: false, dir });
      disabledCache.set('key1', 'value');
      expect(existsSync(dir)).toBe(false);
    });
  });

  describe('disk persistence', () => {
    it('should persist and reload entries from disk', () => {
      const dir = mkdtempSync(join(tmpdir(), 'bellwether-cache-'));
      const cacheWithDisk = new ResponseCache({ dir });
      cacheWithDisk.set('key1', { data: 'persist' });

      const newCache = new ResponseCache({ dir });
      const value = newCache.get<{ data: string }>('key1');
      expect(value).toEqual({ data: 'persist' });

      rmSync(dir, { recursive: true, force: true });
    });

    it('should remove persisted entries on clear', () => {
      const dir = mkdtempSync(join(tmpdir(), 'bellwether-cache-'));
      const cacheWithDisk = new ResponseCache({ dir });
      cacheWithDisk.set('key1', 'value');

      cacheWithDisk.clear();
      const files = existsSync(dir) ? readdirSync(dir) : [];
      expect(files.length).toBe(0);

      rmSync(dir, { recursive: true, force: true });
    });
  });
});

describe('ToolResponseCache', () => {
  let cache: ToolResponseCache;

  beforeEach(() => {
    cache = new ToolResponseCache();
  });

  describe('tool response caching', () => {
    it('should cache and retrieve tool responses', () => {
      const args = { query: 'test' };
      const response = { result: 'success' };

      cache.setToolResponse('search', args, response);
      const cached = cache.getToolResponse('search', args);

      expect(cached).toEqual(response);
    });

    it('should generate unique keys for different tools', () => {
      const args = { query: 'test' };

      cache.setToolResponse('search', args, 'search result');
      cache.setToolResponse('fetch', args, 'fetch result');

      expect(cache.getToolResponse('search', args)).toBe('search result');
      expect(cache.getToolResponse('fetch', args)).toBe('fetch result');
    });

    it('should generate unique keys for different args', () => {
      cache.setToolResponse('search', { query: 'a' }, 'result a');
      cache.setToolResponse('search', { query: 'b' }, 'result b');

      expect(cache.getToolResponse('search', { query: 'a' })).toBe('result a');
      expect(cache.getToolResponse('search', { query: 'b' })).toBe('result b');
    });
  });

  describe('analysis caching', () => {
    it('should cache and retrieve analysis', () => {
      const args = { query: 'test' };
      const responseHash = cache.hashResponse({ data: 'response' });

      cache.setAnalysis('search', args, responseHash, 'Analysis text');
      const cached = cache.getAnalysis('search', args, responseHash);

      expect(cached).toBe('Analysis text');
    });

    it('should hash responses consistently', () => {
      const response = { data: [1, 2, 3] };
      const hash1 = cache.hashResponse(response);
      const hash2 = cache.hashResponse(response);

      expect(hash1).toBe(hash2);
    });
  });
});

describe('Global cache', () => {
  afterEach(() => {
    resetGlobalCache();
  });

  it('should return same instance', () => {
    const cache1 = getGlobalCache();
    const cache2 = getGlobalCache();

    expect(cache1).toBe(cache2);
  });

  it('should reset global cache', () => {
    const cache1 = getGlobalCache();
    cache1.set('test', 'value');

    resetGlobalCache();

    const cache2 = getGlobalCache();
    expect(cache2.has('test')).toBe(false);
  });
});
