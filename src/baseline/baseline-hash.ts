import { createHash } from 'crypto';
import type { BehavioralBaseline } from './types.js';

/**
 * Recursively sort all object keys for deterministic serialization.
 * This ensures hash consistency regardless of property insertion order.
 */
function sortObjectKeys(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function calculateBaselineHash(
  baseline: Omit<BehavioralBaseline, 'hash'>
): string {
  // Sort all object keys recursively for deterministic hashing
  const sorted = sortObjectKeys(baseline);
  const normalized = JSON.stringify(sorted);

  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
