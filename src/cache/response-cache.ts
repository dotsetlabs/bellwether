/**
 * Content-addressable cache for tool responses.
 * Enables reuse of tool call results and LLM analysis across personas.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getLogger } from '../logging/logger.js';
import { TIME_CONSTANTS, CACHE } from '../constants.js';

const logger = getLogger('response-cache');

/**
 * Cache entry with metadata.
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** When the entry was created */
  createdAt: Date;
  /** When the entry was last accessed */
  lastAccessedAt: Date;
  /** When the entry expires */
  expiresAt: Date;
  /** Cache key (hash) */
  key: string;
  /** Human-readable description of what's cached */
  description?: string;
  /** Number of times this entry has been accessed */
  hitCount: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number;
  /** Total number of cache misses */
  misses: number;
  /** Current number of entries */
  entries: number;
  /** Total bytes used (approximate) */
  sizeBytes: number;
  /** Hit rate as percentage */
  hitRate: number;
}

/**
 * Cache configuration.
 */
export interface CacheConfig {
  /** Default TTL in milliseconds (default: 3600000 = 1 hour) */
  defaultTTLMs?: number;
  /** Maximum number of entries (default: 1000) */
  maxEntries?: number;
  /** Maximum total size in bytes (default: 50MB) */
  maxSizeBytes?: number;
  /** Whether to enable cache (default: true) */
  enabled?: boolean;
  /** Optional cache directory for persistence */
  dir?: string;
}

/**
 * In-memory content-addressable cache.
 */
export class ResponseCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private config: Required<CacheConfig>;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };
  private totalSizeBytes = 0;
  private cacheDir?: string;

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTTLMs: config.defaultTTLMs ?? TIME_CONSTANTS.DEFAULT_CACHE_TTL,
      maxEntries: config.maxEntries ?? CACHE.MAX_ENTRIES,
      maxSizeBytes: config.maxSizeBytes ?? 50 * 1024 * 1024, // 50MB
      enabled: config.enabled ?? true,
      dir: config.dir ?? '',
    };
    this.cacheDir = this.config.enabled ? this.config.dir || undefined : undefined;
    if (this.cacheDir) {
      this.ensureCacheDir(this.cacheDir);
    }
  }

  /**
   * Generate a cache key from input data.
   */
  generateKey(...parts: unknown[]): string {
    const serialized = parts.map((p) => stableStringify(p)).join('|');

    // Use 128-bit hash (32 hex chars) to reduce collision risk.
    return createHash('sha256').update(serialized).digest('hex').slice(0, 32);
  }

  /**
   * Get an entry from cache.
   */
  get<T>(key: string): T | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      const diskEntry = this.loadFromDisk<T>(key);
      if (diskEntry) {
        this.cache.set(key, diskEntry as CacheEntry<unknown>);
        this.totalSizeBytes += this.estimateSize(diskEntry.value);
        this.stats.hits++;
        return diskEntry.value as T;
      }
      this.stats.misses++;
      return undefined;
    }

    // Check expiration
    if (new Date() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      logger.debug({ key }, 'Cache entry expired');
      return undefined;
    }

    entry.hitCount++;
    entry.lastAccessedAt = new Date();
    this.stats.hits++;
    logger.debug({ key, hitCount: entry.hitCount }, 'Cache hit');
    return entry.value as T;
  }

  /**
   * Set an entry in cache.
   */
  set<T>(key: string, value: T, options?: { ttlMs?: number; description?: string }): void {
    if (!this.config.enabled) {
      return;
    }

    const ttl = options?.ttlMs ?? this.config.defaultTTLMs;
    const now = new Date();

    // Calculate entry size
    const entrySize = this.estimateSize(value);

    // Evict if necessary; skip if entry can never fit
    if (!this.evictIfNeeded(entrySize)) {
      return;
    }

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: new Date(now.getTime() + ttl),
      key,
      description: options?.description,
      hitCount: 0,
    };

    // Update size tracking
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.totalSizeBytes -= this.estimateSize(existingEntry.value);
    }
    this.totalSizeBytes += entrySize;

    this.cache.set(key, entry as CacheEntry<unknown>);
    logger.debug({ key, ttlMs: ttl, description: options?.description }, 'Cache entry set');

    this.saveToDisk(entry as CacheEntry<unknown>);
  }

  /**
   * Check if key exists and is not expired.
   */
  has(key: string): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (new Date() > entry.expiresAt) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete an entry.
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalSizeBytes -= this.estimateSize(entry.value);
      this.cache.delete(key);
      this.deleteFromDisk(key);
      return true;
    }
    this.deleteFromDisk(key);
    return false;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.totalSizeBytes = 0;
    if (this.cacheDir && existsSync(this.cacheDir)) {
      try {
        for (const file of listCacheFiles(this.cacheDir)) {
          unlinkSync(file);
        }
      } catch {
        // Ignore disk cleanup errors
      }
    }
    logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.cache.size,
      sizeBytes: this.totalSizeBytes,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
    };
  }

  /**
   * Get or compute a value.
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    options?: { ttlMs?: number; description?: string }
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(key, value, options);
    return value;
  }

  /**
   * Evict entries if needed to make room.
   */
  private evictIfNeeded(newEntrySize: number): boolean {
    // Skip entries that can never fit
    if (newEntrySize > this.config.maxSizeBytes) {
      return false;
    }

    // Check entry count
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLeastRecentlyUsed();
    }

    // Check size
    while (this.totalSizeBytes + newEntrySize > this.config.maxSizeBytes && this.cache.size > 0) {
      this.evictLeastRecentlyUsed();
    }

    return true;
  }

  /**
   * Evict the least recently used entry (LRU based on last access time).
   */
  private evictLeastRecentlyUsed(): void {
    let lruKey: string | undefined;
    let oldestAccessTime = Infinity;

    for (const [key, entry] of this.cache) {
      const time = entry.lastAccessedAt.getTime();
      if (time < oldestAccessTime) {
        oldestAccessTime = time;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.delete(lruKey);
      this.stats.evictions++;
      logger.debug({ key: lruKey }, 'Evicted cache entry');
    }
  }

  /**
   * Estimate the size of a value in bytes.
   */
  private estimateSize(value: unknown): number {
    try {
      return JSON.stringify(value).length * 2; // Approximate UTF-16 size
    } catch {
      return 1000; // Default estimate for non-serializable values
    }
  }

  private ensureCacheDir(dir: string): void {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    } catch (error) {
      logger.warn({ dir, error: String(error) }, 'Failed to create cache directory');
      this.cacheDir = undefined;
    }
  }

  private getCachePath(key: string): string | null {
    if (!this.cacheDir) return null;
    return join(this.cacheDir, `${key}.json`);
  }

  private saveToDisk(entry: CacheEntry<unknown>): void {
    const path = this.getCachePath(entry.key);
    if (!path) return;
    try {
      const serialized = JSON.stringify({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
        lastAccessedAt: entry.lastAccessedAt.toISOString(),
        expiresAt: entry.expiresAt.toISOString(),
      });
      writeFileSync(path, serialized, 'utf-8');
    } catch (error) {
      logger.debug({ key: entry.key, error: String(error) }, 'Failed to persist cache entry');
    }
  }

  private loadFromDisk<T>(key: string): CacheEntry<T> | null {
    const path = this.getCachePath(key);
    if (!path || !existsSync(path)) return null;
    try {
      const raw = readFileSync(path, 'utf-8');
      const parsed = JSON.parse(raw) as CacheEntry<T> & {
        createdAt: string;
        lastAccessedAt: string;
        expiresAt: string;
      };
      const entry: CacheEntry<T> = {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        lastAccessedAt: new Date(parsed.lastAccessedAt),
        expiresAt: new Date(parsed.expiresAt),
      };
      if (new Date() > entry.expiresAt) {
        this.deleteFromDisk(key);
        return null;
      }
      entry.hitCount = (entry.hitCount ?? 0) + 1;
      entry.lastAccessedAt = new Date();
      this.saveToDisk(entry as CacheEntry<unknown>);
      return entry;
    } catch (error) {
      logger.debug({ key, error: String(error) }, 'Failed to load cache entry');
      return null;
    }
  }

  private deleteFromDisk(key: string): void {
    const path = this.getCachePath(key);
    if (!path || !existsSync(path)) return;
    try {
      unlinkSync(path);
    } catch {
      // Ignore delete errors
    }
  }
}

function listCacheFiles(dir: string): string[] {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((entry: { isFile: () => boolean }) => entry.isFile())
      .map((entry: { name: string }) => join(dir, entry.name));
  } catch {
    return [];
  }
}

/**
 * Stable, deterministic JSON stringify with deep key sorting.
 * Falls back to string conversion for unsupported types.
 */
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (input === null || input === undefined) return input;

    const type = typeof input;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      return input;
    }

    if (type === 'bigint') {
      return input.toString();
    }

    if (type === 'symbol' || type === 'function') {
      return String(input);
    }

    if (input instanceof Date) {
      return input.toISOString();
    }

    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }

    if (typeof input === 'object') {
      const obj = input as Record<string, unknown>;
      if (seen.has(obj)) {
        return '[Circular]';
      }
      seen.add(obj);
      const keys = Object.keys(obj).sort();
      const normalized: Record<string, unknown> = {};
      for (const key of keys) {
        normalized[key] = normalize(obj[key]);
      }
      return normalized;
    }

    try {
      return JSON.parse(JSON.stringify(input));
    } catch {
      return String(input);
    }
  };

  const normalized = normalize(value);
  const json = JSON.stringify(normalized);
  return json === undefined ? 'undefined' : json;
}

/**
 * Specialized cache for tool responses.
 */
export class ToolResponseCache extends ResponseCache {
  /**
   * Generate key for a tool call.
   */
  toolCallKey(toolName: string, args: Record<string, unknown>): string {
    return this.generateKey('tool', toolName, args);
  }

  /**
   * Get cached tool response.
   */
  getToolResponse<T>(toolName: string, args: Record<string, unknown>): T | undefined {
    const key = this.toolCallKey(toolName, args);
    return this.get<T>(key);
  }

  /**
   * Cache a tool response.
   */
  setToolResponse<T>(
    toolName: string,
    args: Record<string, unknown>,
    response: T,
    ttlMs?: number
  ): void {
    const key = this.toolCallKey(toolName, args);
    this.set(key, response, {
      ttlMs,
      description: `Tool: ${toolName}`,
    });
  }

  /**
   * Generate key for LLM analysis.
   */
  analysisKey(toolName: string, args: Record<string, unknown>, responseHash: string): string {
    return this.generateKey('analysis', toolName, args, responseHash);
  }

  /**
   * Get cached analysis.
   */
  getAnalysis(
    toolName: string,
    args: Record<string, unknown>,
    responseHash: string
  ): string | undefined {
    const key = this.analysisKey(toolName, args, responseHash);
    return this.get<string>(key);
  }

  /**
   * Cache an analysis.
   */
  setAnalysis(
    toolName: string,
    args: Record<string, unknown>,
    responseHash: string,
    analysis: string,
    ttlMs?: number
  ): void {
    const key = this.analysisKey(toolName, args, responseHash);
    this.set(key, analysis, {
      ttlMs,
      description: `Analysis: ${toolName}`,
    });
  }

  /**
   * Hash a response for use in analysis key.
   */
  hashResponse(response: unknown): string {
    return this.generateKey('response', response);
  }
}

/**
 * Global cache instance for sharing across modules.
 */
let globalCache: ToolResponseCache | undefined;

/**
 * Get or create the global cache instance.
 */
export function getGlobalCache(config?: CacheConfig): ToolResponseCache {
  if (!globalCache) {
    globalCache = new ToolResponseCache(config);
  }
  return globalCache;
}

/**
 * Reset the global cache (for testing).
 */
export function resetGlobalCache(): void {
  globalCache?.clear();
  globalCache = undefined;
}
