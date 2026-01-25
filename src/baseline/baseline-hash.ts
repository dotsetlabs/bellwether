import { createHash } from 'crypto';
import type { BehavioralBaseline } from './types.js';

export function calculateBaselineHash(
  baseline: Omit<BehavioralBaseline, 'hash'>
): string {
  const normalized = JSON.stringify(baseline, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });

  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
