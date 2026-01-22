/**
 * Mock LLM client for deterministic testing.
 */

import type { LLMClient, Message, CompletionOptions, ProviderInfo, StreamingOptions, StreamingResult } from '../../src/llm/client.js';

/**
 * Response handler type for custom mock behavior.
 */
export type ResponseHandler = (
  messages: Message[],
  options?: CompletionOptions
) => string | Promise<string>;

/**
 * Configuration for mock LLM client.
 */
export interface MockLLMConfig {
  /** Default response for all calls */
  defaultResponse?: string;
  /** Responses keyed by pattern match on last message */
  patternResponses?: Map<RegExp, string>;
  /** Custom handler for full control */
  handler?: ResponseHandler;
  /** Whether to track call history */
  trackCalls?: boolean;
  /** Simulate delay in ms */
  delay?: number;
  /** Throw error on calls */
  throwError?: Error;
}

/**
 * Recorded call for verification.
 */
export interface RecordedCall {
  messages: Message[];
  options?: CompletionOptions;
  response: string;
  timestamp: Date;
}

/**
 * Mock LLM client with configurable responses.
 */
export class MockLLMClient implements LLMClient {
  private config: MockLLMConfig;
  private calls: RecordedCall[] = [];
  private callCount = 0;

  constructor(config: MockLLMConfig = {}) {
    this.config = {
      defaultResponse: '{"result": "mock response"}',
      trackCalls: true,
      ...config,
    };
  }

  async chat(messages: Message[], options?: CompletionOptions): Promise<string> {
    this.callCount++;

    if (this.config.throwError) {
      throw this.config.throwError;
    }

    if (this.config.delay) {
      await new Promise(resolve => setTimeout(resolve, this.config.delay));
    }

    let response: string;

    // Use custom handler if provided
    if (this.config.handler) {
      response = await this.config.handler(messages, options);
    }
    // Check pattern matches
    else if (this.config.patternResponses) {
      const lastMessage = messages[messages.length - 1]?.content ?? '';
      for (const [pattern, patternResponse] of this.config.patternResponses) {
        if (pattern.test(lastMessage)) {
          response = patternResponse;
          break;
        }
      }
      response ??= this.config.defaultResponse!;
    }
    // Use default response
    else {
      response = this.config.defaultResponse!;
    }

    // Track call if enabled
    if (this.config.trackCalls) {
      this.calls.push({
        messages: [...messages],
        options,
        response,
        timestamp: new Date(),
      });
    }

    return response;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  getProviderInfo(): ProviderInfo {
    return {
      id: 'mock',
      name: 'Mock Provider',
      supportsJSON: true,
      supportsStreaming: true,
      defaultModel: 'mock-model',
    };
  }

  async stream(prompt: string, options?: StreamingOptions): Promise<StreamingResult> {
    const text = await this.complete(prompt, options);
    options?.onChunk?.(text);
    options?.onComplete?.(text);
    return { text, completed: true };
  }

  async streamChat(messages: Message[], options?: StreamingOptions): Promise<StreamingResult> {
    const text = await this.chat(messages, options);
    options?.onChunk?.(text);
    options?.onComplete?.(text);
    return { text, completed: true };
  }

  parseJSON<T>(response: string): T {
    // Handle markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as T;
    }
    return JSON.parse(response) as T;
  }

  /**
   * Get all recorded calls.
   */
  getCalls(): RecordedCall[] {
    return [...this.calls];
  }

  /**
   * Get the number of calls made.
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Get the last call made.
   */
  getLastCall(): RecordedCall | undefined {
    return this.calls[this.calls.length - 1];
  }

  /**
   * Clear call history.
   */
  clearCalls(): void {
    this.calls = [];
    this.callCount = 0;
  }

  /**
   * Update config at runtime.
   */
  setConfig(config: Partial<MockLLMConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Pre-configured mock for question generation tests.
 */
export function createQuestionGeneratorMock(): MockLLMClient {
  return new MockLLMClient({
    handler: (messages) => {
      const lastMessage = messages[messages.length - 1]?.content ?? '';

      // Check if asking for questions about a tool
      if (lastMessage.includes('generate') && lastMessage.includes('question')) {
        return JSON.stringify({
          questions: [
            {
              description: 'Test basic functionality',
              category: 'happy_path',
              args: { location: 'New York' },
            },
            {
              description: 'Test with invalid input',
              category: 'error_handling',
              args: { location: '' },
            },
          ],
        });
      }

      // Check if analyzing a response
      if (lastMessage.includes('analyze') || lastMessage.includes('behavior')) {
        return JSON.stringify({
          analysis: 'The tool responded successfully with the expected data format.',
        });
      }

      // Check if synthesizing a profile
      if (lastMessage.includes('synthesize') || lastMessage.includes('summary')) {
        return JSON.stringify({
          behavioralNotes: ['Responds quickly to valid inputs', 'Returns structured data'],
          limitations: ['Does not support batch operations'],
          securityNotes: ['No authentication required'],
        });
      }

      // Default response
      return JSON.stringify({ result: 'mock response' });
    },
  });
}

/**
 * Pre-configured mock for analysis tests.
 */
export function createAnalysisMock(): MockLLMClient {
  return new MockLLMClient({
    defaultResponse: JSON.stringify({
      analysis: 'The tool executed successfully and returned valid data.',
    }),
  });
}

/**
 * Pre-configured mock that always fails.
 */
export function createFailingMock(error?: Error): MockLLMClient {
  return new MockLLMClient({
    throwError: error ?? new Error('Mock LLM error'),
  });
}

/**
 * Pre-configured mock with delayed responses.
 */
export function createSlowMock(delayMs: number): MockLLMClient {
  return new MockLLMClient({
    delay: delayMs,
    defaultResponse: JSON.stringify({ result: 'delayed response' }),
  });
}

/**
 * Create mock for specific question responses.
 */
export function createMockWithQuestions(
  questions: Array<{
    description: string;
    category: 'happy_path' | 'edge_case' | 'error_handling' | 'boundary';
    args: Record<string, unknown>;
  }>
): MockLLMClient {
  return new MockLLMClient({
    handler: (messages) => {
      const lastMessage = messages[messages.length - 1]?.content ?? '';

      if (lastMessage.includes('generate') || lastMessage.includes('question')) {
        return JSON.stringify({ questions });
      }

      return JSON.stringify({
        analysis: 'Tool executed as expected.',
      });
    },
  });
}
