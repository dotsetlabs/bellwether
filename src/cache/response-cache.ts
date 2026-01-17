/**
 * Content-addressable cache for tool responses.
 * Enables reuse of tool call results and LLM analysis across personas.
 */

import { createHash } from 'crypto';
import { getLogger } from '../logging/logger.js';

const logger = getLogger('response-cache');

/**
 * Cache entry with metadata.
 */
export interface CacheEntry<T> {
  /** The cached value */
  value: T;
  /** When the entry was created */
  createdAt: Date;
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

  constructor(config: CacheConfig = {}) {
    this.config = {
      defaultTTLMs: config.defaultTTLMs ?? 3600000, // 1 hour
      maxEntries: config.maxEntries ?? 1000,
      maxSizeBytes: config.maxSizeBytes ?? 50 * 1024 * 1024, // 50MB
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Generate a cache key from input data.
   */
  generateKey(...parts: unknown[]): string {
    const serialized = parts.map((p) => {
      if (typeof p === 'string') return p;
      if (typeof p === 'undefined') return 'undefined';
      if (p === null) return 'null';
      try {
        return JSON.stringify(p, Object.keys(p as object).sort());
      } catch {
        return String(p);
      }
    }).join('|');

    return createHash('sha256').update(serialized).digest('hex').slice(0, 16);
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
    this.stats.hits++;
    logger.debug({ key, hitCount: entry.hitCount }, 'Cache hit');
    return entry.value as T;
  }

  /**
   * Set an entry in cache.
   */
  set<T>(
    key: string,
    value: T,
    options?: { ttlMs?: number; description?: string }
  ): void {
    if (!this.config.enabled) {
      return;
    }

    const ttl = options?.ttlMs ?? this.config.defaultTTLMs;
    const now = new Date();

    // Calculate entry size
    const entrySize = this.estimateSize(value);

    // Evict if necessary
    this.evictIfNeeded(entrySize);

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
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
      return true;
    }
    return false;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
    this.totalSizeBytes = 0;
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
  private evictIfNeeded(newEntrySize: number): void {
    // Check entry count
    while (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    // Check size
    while (
      this.totalSizeBytes + newEntrySize > this.config.maxSizeBytes &&
      this.cache.size > 0
    ) {
      this.evictOldest();
    }
  }

  /**
   * Evict the oldest entry (LRU based on creation time).
   */
  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      const time = entry.createdAt.getTime();
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
      logger.debug({ key: oldestKey }, 'Evicted cache entry');
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

  /**
   * Prune expired entries.
   */
  prune(): number {
    let pruned = 0;
    const now = new Date();

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.debug({ prunedCount: pruned }, 'Pruned expired entries');
    }

    return pruned;
  }
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
  getToolResponse<T>(
    toolName: string,
    args: Record<string, unknown>
  ): T | undefined {
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
  analysisKey(
    toolName: string,
    args: Record<string, unknown>,
    responseHash: string
  ): string {
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
