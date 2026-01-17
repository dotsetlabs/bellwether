/**
 * Concurrency utilities for parallel execution with limits.
 */

/**
 * Options for parallel execution.
 */
export interface ParallelOptions<T> {
  /** Maximum concurrent tasks (default: 3) */
  concurrency?: number;
  /** Callback when a task completes */
  onTaskComplete?: (result: T, index: number) => void;
  /** Callback when a task fails */
  onTaskError?: (error: Error, index: number) => void;
}

/**
 * Result of a parallel execution.
 */
export interface ParallelResult<T> {
  /** Successful results */
  results: T[];
  /** Errors by index */
  errors: Map<number, Error>;
  /** Whether all tasks succeeded */
  allSucceeded: boolean;
}

/**
 * Execute tasks in parallel with a concurrency limit.
 * Uses a semaphore pattern to limit concurrent execution.
 *
 * @param tasks - Array of async task functions to execute
 * @param options - Parallel execution options
 * @returns Results of all tasks
 */
export async function parallelLimit<T>(
  tasks: Array<() => Promise<T>>,
  options: ParallelOptions<T> = {}
): Promise<ParallelResult<T>> {
  const { concurrency = 3, onTaskComplete, onTaskError } = options;

  const results: T[] = new Array(tasks.length);
  const errors = new Map<number, Error>();
  let running = 0;
  let index = 0;

  return new Promise((resolve) => {
    const startNext = () => {
      // Check if we're done
      if (index >= tasks.length && running === 0) {
        resolve({
          results,
          errors,
          allSucceeded: errors.size === 0,
        });
        return;
      }

      // Start tasks up to concurrency limit
      while (running < concurrency && index < tasks.length) {
        const currentIndex = index++;
        running++;

        tasks[currentIndex]()
          .then((result) => {
            results[currentIndex] = result;
            onTaskComplete?.(result, currentIndex);
          })
          .catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            errors.set(currentIndex, err);
            onTaskError?.(err, currentIndex);
          })
          .finally(() => {
            running--;
            startNext();
          });
      }
    };

    // Handle empty task list
    if (tasks.length === 0) {
      resolve({
        results: [],
        errors: new Map(),
        allSucceeded: true,
      });
      return;
    }

    startNext();
  });
}

/**
 * Execute tasks in parallel with a concurrency limit, collecting all results.
 * Unlike parallelLimit, this version preserves order and includes errors inline.
 *
 * @param items - Array of items to process
 * @param fn - Async function to process each item
 * @param options - Parallel execution options
 * @returns Array of results (or errors) in original order
 */
export async function mapLimit<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ParallelOptions<R> = {}
): Promise<Array<{ success: true; value: R } | { success: false; error: Error }>> {
  const tasks = items.map((item, i) => async () => fn(item, i));
  const { results, errors } = await parallelLimit(tasks, options);

  return items.map((_, i) => {
    const error = errors.get(i);
    if (error) {
      return { success: false as const, error };
    }
    return { success: true as const, value: results[i] };
  });
}

/**
 * Create a semaphore for limiting concurrent access to a resource.
 */
export function createSemaphore(limit: number) {
  let current = 0;
  const queue: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (current < limit) {
        current++;
        return;
      }

      return new Promise((resolve) => {
        queue.push(() => {
          current++;
          resolve();
        });
      });
    },

    release(): void {
      current--;
      if (queue.length > 0) {
        const next = queue.shift();
        next?.();
      }
    },

    get available(): number {
      return limit - current;
    },

    get waiting(): number {
      return queue.length;
    },
  };
}

/**
 * Mutex for ensuring exclusive access to a resource.
 */
export function createMutex() {
  return createSemaphore(1);
}

/**
 * Thread-safe accumulator for collecting results from parallel tasks.
 */
export class SafeAccumulator<T> {
  private items: T[] = [];
  private mutex = createMutex();

  /**
   * Add an item to the accumulator.
   */
  async add(item: T): Promise<void> {
    await this.mutex.acquire();
    try {
      this.items.push(item);
    } finally {
      this.mutex.release();
    }
  }

  /**
   * Add multiple items to the accumulator.
   */
  async addAll(items: T[]): Promise<void> {
    await this.mutex.acquire();
    try {
      this.items.push(...items);
    } finally {
      this.mutex.release();
    }
  }

  /**
   * Get all accumulated items.
   */
  getAll(): T[] {
    return [...this.items];
  }

  /**
   * Get the current count.
   */
  get count(): number {
    return this.items.length;
  }
}

/**
 * Thread-safe map for collecting keyed results.
 */
export class SafeMap<K, V> {
  private map = new Map<K, V>();
  private mutex = createMutex();

  /**
   * Set a value in the map.
   */
  async set(key: K, value: V): Promise<void> {
    await this.mutex.acquire();
    try {
      this.map.set(key, value);
    } finally {
      this.mutex.release();
    }
  }

  /**
   * Get a value from the map.
   */
  get(key: K): V | undefined {
    return this.map.get(key);
  }

  /**
   * Check if a key exists.
   */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Get all entries.
   */
  entries(): IterableIterator<[K, V]> {
    return this.map.entries();
  }

  /**
   * Get all values.
   */
  values(): IterableIterator<V> {
    return this.map.values();
  }

  /**
   * Get the current size.
   */
  get size(): number {
    return this.map.size;
  }
}
