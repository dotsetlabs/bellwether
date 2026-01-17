/**
 * Semantic Embeddings for Drift Detection
 *
 * Provides optional embedding-based similarity for improved paraphrase detection.
 * Uses Ollama for local embeddings (free, no API cost) or can be extended
 * for other providers.
 */

import type { ConfidenceFactor } from './types.js';

/**
 * Interface for embedding providers.
 */
export interface EmbeddingProvider {
  /** Provider name */
  name: string;

  /** Generate embedding vector for text */
  embed(text: string): Promise<number[]>;

  /** Calculate similarity between two embedding vectors */
  similarity(a: number[], b: number[]): number;

  /** Check if the provider is available */
  isAvailable(): Promise<boolean>;
}

/**
 * Ollama-based local embeddings using nomic-embed-text model.
 * Free and runs locally without API costs.
 */
export class OllamaEmbeddings implements EmbeddingProvider {
  name = 'ollama';
  private baseUrl: string;
  private model: string;
  private cache: Map<string, number[]> = new Map();

  constructor(options: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = options.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = options.model ?? 'nomic-embed-text';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async embed(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = `${this.model}:${text}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding failed: ${response.statusText}`);
    }

    const result = await response.json() as { embedding: number[] };
    const embedding = result.embedding;

    // Cache the result
    this.cache.set(cacheKey, embedding);

    return embedding;
  }

  similarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 is identical.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Configuration for embedding-enhanced comparison.
 */
export interface EmbeddingConfig {
  /** Whether to use embeddings (default: false) */
  enabled: boolean;

  /** Embedding provider to use */
  provider: EmbeddingProvider;

  /** Weight for embedding similarity in overall confidence (0-1) */
  weight: number;

  /** Minimum similarity to consider a match (0-1) */
  matchThreshold: number;

  /** Timeout for embedding requests in ms */
  timeout: number;
}

/**
 * Default embedding configuration.
 */
export const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  enabled: false,
  provider: new OllamaEmbeddings(),
  weight: 0.3,
  matchThreshold: 0.75,
  timeout: 5000,
};

/**
 * Result of embedding-based comparison.
 */
export interface EmbeddingComparisonResult {
  /** Whether embeddings were successfully used */
  used: boolean;

  /** Cosine similarity score (0-1) */
  similarity: number;

  /** Similarity as percentage (0-100) */
  similarityPercent: number;

  /** Whether similarity meets match threshold */
  meetsThreshold: boolean;

  /** Error message if embeddings failed */
  error?: string;
}

/**
 * Compare two texts using embeddings.
 */
export async function compareWithEmbeddings(
  text1: string,
  text2: string,
  config: Partial<EmbeddingConfig> = {}
): Promise<EmbeddingComparisonResult> {
  const fullConfig = { ...DEFAULT_EMBEDDING_CONFIG, ...config };

  if (!fullConfig.enabled) {
    return {
      used: false,
      similarity: 0,
      similarityPercent: 0,
      meetsThreshold: false,
    };
  }

  try {
    // Check if provider is available
    const available = await Promise.race([
      fullConfig.provider.isAvailable(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Availability check timeout')), 2000)
      ),
    ]);

    if (!available) {
      return {
        used: false,
        similarity: 0,
        similarityPercent: 0,
        meetsThreshold: false,
        error: 'Embedding provider not available',
      };
    }

    // Generate embeddings with timeout
    const embedPromise = Promise.all([
      fullConfig.provider.embed(text1),
      fullConfig.provider.embed(text2),
    ]);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Embedding timeout')), fullConfig.timeout)
    );

    const [emb1, emb2] = await Promise.race([embedPromise, timeoutPromise]);

    // Calculate similarity
    const similarity = fullConfig.provider.similarity(emb1, emb2);
    const similarityPercent = Math.round(similarity * 100);

    return {
      used: true,
      similarity,
      similarityPercent,
      meetsThreshold: similarity >= fullConfig.matchThreshold,
    };
  } catch (error) {
    return {
      used: false,
      similarity: 0,
      similarityPercent: 0,
      meetsThreshold: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Create a confidence factor from embedding comparison.
 */
export function createEmbeddingFactor(result: EmbeddingComparisonResult): ConfidenceFactor | null {
  if (!result.used) {
    return null;
  }

  return {
    name: 'embedding_similarity',
    weight: DEFAULT_EMBEDDING_CONFIG.weight,
    value: result.similarityPercent,
    description: `${result.similarityPercent}% semantic embedding similarity`,
  };
}

/**
 * Enhanced semantic comparator that optionally uses embeddings.
 */
export class EmbeddingEnhancedComparator {
  private config: EmbeddingConfig;
  private providerChecked = false;
  private providerAvailable = false;

  constructor(config: Partial<EmbeddingConfig> = {}) {
    this.config = { ...DEFAULT_EMBEDDING_CONFIG, ...config };
  }

  /**
   * Check provider availability (cached).
   */
  async checkAvailability(): Promise<boolean> {
    if (this.providerChecked) {
      return this.providerAvailable;
    }

    this.providerAvailable = await this.config.provider.isAvailable();
    this.providerChecked = true;
    return this.providerAvailable;
  }

  /**
   * Get embedding similarity as an additional confidence factor.
   * Falls back gracefully if embeddings are unavailable.
   */
  async getEmbeddingFactor(text1: string, text2: string): Promise<ConfidenceFactor | null> {
    if (!this.config.enabled) {
      return null;
    }

    const result = await compareWithEmbeddings(text1, text2, this.config);
    return createEmbeddingFactor(result);
  }

  /**
   * Determine if texts match based on embedding similarity alone.
   */
  async matchesByEmbedding(text1: string, text2: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const result = await compareWithEmbeddings(text1, text2, this.config);
    return result.meetsThreshold;
  }
}

/**
 * Check if Ollama is available and has the embedding model.
 */
export async function checkOllamaEmbeddings(): Promise<{
  available: boolean;
  hasModel: boolean;
  modelName: string;
  error?: string;
}> {
  const provider = new OllamaEmbeddings();

  try {
    const available = await provider.isAvailable();

    if (!available) {
      return {
        available: false,
        hasModel: false,
        modelName: 'nomic-embed-text',
        error: 'Ollama is not running or not accessible',
      };
    }

    // Try to generate a test embedding
    try {
      await provider.embed('test');
      return {
        available: true,
        hasModel: true,
        modelName: 'nomic-embed-text',
      };
    } catch (embedError) {
      return {
        available: true,
        hasModel: false,
        modelName: 'nomic-embed-text',
        error: `Model not found. Run: ollama pull nomic-embed-text`,
      };
    }
  } catch (error) {
    return {
      available: false,
      hasModel: false,
      modelName: 'nomic-embed-text',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
