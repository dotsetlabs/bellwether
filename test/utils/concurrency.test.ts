import { describe, it, expect, vi } from 'vitest';
import {
  parallelLimit,
  mapLimit,
  createSemaphore,
  createMutex,
  SafeAccumulator,
  SafeMap,
} from '../../src/utils/concurrency.js';

describe('parallelLimit', () => {
  it('should execute tasks in parallel with concurrency limit', async () => {
    const executionOrder: number[] = [];
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionOrder.push(n);
      return n * 2;
    });

    const result = await parallelLimit(tasks, { concurrency: 2 });

    expect(result.allSucceeded).toBe(true);
    expect(result.results).toEqual([2, 4, 6, 8, 10]);
    expect(result.errors.size).toBe(0);
  });

  it('should handle empty task list', async () => {
    const result = await parallelLimit<number>([], { concurrency: 3 });

    expect(result.allSucceeded).toBe(true);
    expect(result.results).toEqual([]);
    expect(result.errors.size).toBe(0);
  });

  it('should capture errors while continuing other tasks', async () => {
    const tasks = [
      async () => 1,
      async () => { throw new Error('Task 2 failed'); },
      async () => 3,
      async () => { throw new Error('Task 4 failed'); },
      async () => 5,
    ];

    const result = await parallelLimit(tasks, { concurrency: 2 });

    expect(result.allSucceeded).toBe(false);
    expect(result.results[0]).toBe(1);
    expect(result.results[2]).toBe(3);
    expect(result.results[4]).toBe(5);
    expect(result.errors.size).toBe(2);
    expect(result.errors.get(1)?.message).toBe('Task 2 failed');
    expect(result.errors.get(3)?.message).toBe('Task 4 failed');
  });

  it('should call onTaskComplete callback for successful tasks', async () => {
    const completed: Array<{ result: number; index: number }> = [];
    const tasks = [1, 2, 3].map((n) => async () => n * 2);

    await parallelLimit(tasks, {
      concurrency: 2,
      onTaskComplete: (result, index) => {
        completed.push({ result, index });
      },
    });

    expect(completed).toHaveLength(3);
    expect(completed.map((c) => c.result).sort()).toEqual([2, 4, 6]);
  });

  it('should call onTaskError callback for failed tasks', async () => {
    const errors: Array<{ error: Error; index: number }> = [];
    const tasks = [
      async () => 1,
      async () => { throw new Error('Failed'); },
    ];

    await parallelLimit(tasks, {
      concurrency: 2,
      onTaskError: (error, index) => {
        errors.push({ error, index });
      },
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].index).toBe(1);
    expect(errors[0].error.message).toBe('Failed');
  });

  it('should respect concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return true;
    });

    await parallelLimit(tasks, { concurrency: 3 });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });
});

describe('mapLimit', () => {
  it('should map items with concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapLimit(items, async (n) => n * 2, { concurrency: 2 });

    expect(results.every((r) => r.success)).toBe(true);
    expect(results.map((r) => (r as { success: true; value: number }).value)).toEqual([2, 4, 6, 8, 10]);
  });

  it('should preserve order even with different execution times', async () => {
    const items = [100, 50, 10]; // Delay in ms
    const results = await mapLimit(
      items,
      async (delay) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return delay;
      },
      { concurrency: 3 }
    );

    // Results should be in original order despite different completion times
    expect(results.map((r) => (r as { success: true; value: number }).value)).toEqual([100, 50, 10]);
  });

  it('should include errors inline', async () => {
    const items = [1, 2, 3];
    const results = await mapLimit(
      items,
      async (n) => {
        if (n === 2) throw new Error('Fail');
        return n;
      },
      { concurrency: 2 }
    );

    expect(results[0]).toEqual({ success: true, value: 1 });
    expect((results[1] as { success: false; error: Error }).success).toBe(false);
    expect((results[1] as { success: false; error: Error }).error.message).toBe('Fail');
    expect(results[2]).toEqual({ success: true, value: 3 });
  });
});

describe('createSemaphore', () => {
  it('should limit concurrent access', async () => {
    const semaphore = createSemaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, () => async () => {
      await semaphore.acquire();
      try {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent--;
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(tasks.map((t) => t()));

    expect(maxConcurrent).toBe(2);
  });

  it('should track available slots', async () => {
    const semaphore = createSemaphore(3);

    expect(semaphore.available).toBe(3);
    await semaphore.acquire();
    expect(semaphore.available).toBe(2);
    await semaphore.acquire();
    expect(semaphore.available).toBe(1);
    semaphore.release();
    expect(semaphore.available).toBe(2);
  });

  it('should queue waiting acquires', async () => {
    const semaphore = createSemaphore(1);
    const order: number[] = [];

    await semaphore.acquire();

    // Start two more acquires that will queue
    const p1 = (async () => {
      await semaphore.acquire();
      order.push(1);
      semaphore.release();
    })();

    const p2 = (async () => {
      await semaphore.acquire();
      order.push(2);
      semaphore.release();
    })();

    // Small delay to ensure both are queued
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(semaphore.waiting).toBe(2);

    // Release to let queued acquires proceed
    semaphore.release();
    await Promise.all([p1, p2]);

    expect(order).toEqual([1, 2]); // FIFO order
  });
});

describe('createMutex', () => {
  it('should allow only one access at a time', async () => {
    const mutex = createMutex();
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, () => async () => {
      await mutex.acquire();
      try {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 5));
        concurrent--;
      } finally {
        mutex.release();
      }
    });

    await Promise.all(tasks.map((t) => t()));

    expect(maxConcurrent).toBe(1);
  });
});

describe('SafeAccumulator', () => {
  it('should safely accumulate items', async () => {
    const accumulator = new SafeAccumulator<number>();

    await Promise.all([
      accumulator.add(1),
      accumulator.add(2),
      accumulator.add(3),
    ]);

    const items = accumulator.getAll();
    expect(items.sort()).toEqual([1, 2, 3]);
    expect(accumulator.count).toBe(3);
  });

  it('should safely accumulate arrays', async () => {
    const accumulator = new SafeAccumulator<number>();

    await Promise.all([
      accumulator.addAll([1, 2]),
      accumulator.addAll([3, 4]),
    ]);

    const items = accumulator.getAll();
    expect(items.sort()).toEqual([1, 2, 3, 4]);
    expect(accumulator.count).toBe(4);
  });
});

describe('SafeMap', () => {
  it('should safely set and get values', async () => {
    const map = new SafeMap<string, number>();

    await Promise.all([
      map.set('a', 1),
      map.set('b', 2),
      map.set('c', 3),
    ]);

    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
    expect(map.size).toBe(3);
  });

  it('should report key existence', async () => {
    const map = new SafeMap<string, number>();

    await map.set('exists', 42);

    expect(map.has('exists')).toBe(true);
    expect(map.has('missing')).toBe(false);
  });

  it('should iterate entries and values', async () => {
    const map = new SafeMap<string, number>();

    await map.set('a', 1);
    await map.set('b', 2);

    const entries = [...map.entries()];
    expect(entries.sort()).toEqual([['a', 1], ['b', 2]]);

    const values = [...map.values()];
    expect(values.sort()).toEqual([1, 2]);
  });
});
