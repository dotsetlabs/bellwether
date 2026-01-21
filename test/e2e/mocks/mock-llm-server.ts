/**
 * Mock LLM Server for E2E tests.
 *
 * Creates an HTTP server that mimics OpenAI/Anthropic API endpoints
 * for testing the explore command without making real API calls.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';

export interface MockLLMConfig {
  /** Pattern-based responses: regex pattern → response content */
  responses?: Map<RegExp, string>;
  /** Default response if no pattern matches */
  defaultResponse?: string;
  /** Fail all requests with this error message */
  failRequests?: boolean;
  /** Error message when failRequests is true */
  errorMessage?: string;
  /** Artificial latency in ms */
  latencyMs?: number;
  /** Track request history */
  trackRequests?: boolean;
  /** Model name to return */
  modelName?: string;
  /** Simulate rate limiting */
  rateLimitAfter?: number;
}

export interface MockLLMServer {
  /** Server URL (e.g., http://localhost:3456) */
  url: string;
  /** Port number */
  port: number;
  /** Close the server */
  close: () => Promise<void>;
  /** Get request history (if trackRequests was enabled) */
  getRequestHistory: () => RequestRecord[];
  /** Clear request history */
  clearHistory: () => void;
  /** Update configuration */
  updateConfig: (config: Partial<MockLLMConfig>) => void;
}

export interface RequestRecord {
  timestamp: Date;
  method: string;
  path: string;
  body: unknown;
}

/**
 * Create a mock LLM server that mimics OpenAI and Anthropic APIs.
 */
export async function createMockLLMServer(
  config: MockLLMConfig = {}
): Promise<MockLLMServer> {
  let currentConfig = { ...config };
  const requestHistory: RequestRecord[] = [];
  let requestCount = 0;

  const server = createServer((req, res) => {
    handleRequest(req, res, currentConfig, requestHistory, () => requestCount++);
  });

  // Find an available port
  const port = await new Promise<number>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address !== 'string') {
        resolve(address.port);
      } else {
        reject(new Error('Failed to get server port'));
      }
    });

    server.on('error', reject);
  });

  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    port,
    close: () => {
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
    getRequestHistory: () => [...requestHistory],
    clearHistory: () => {
      requestHistory.length = 0;
      requestCount = 0;
    },
    updateConfig: (newConfig) => {
      currentConfig = { ...currentConfig, ...newConfig };
    },
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: MockLLMConfig,
  history: RequestRecord[],
  incrementCount: () => number
): Promise<void> {
  const count = incrementCount();

  // Apply latency
  if (config.latencyMs && config.latencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.latencyMs));
  }

  // Parse body
  let body: unknown = null;
  if (req.method === 'POST') {
    body = await parseBody(req);
  }

  // Track request
  if (config.trackRequests !== false) {
    history.push({
      timestamp: new Date(),
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      body,
    });
  }

  // Check rate limiting
  if (config.rateLimitAfter && count >= config.rateLimitAfter) {
    sendError(res, 429, 'Rate limit exceeded', 'rate_limit_error');
    return;
  }

  // Check if we should fail
  if (config.failRequests) {
    sendError(res, 500, config.errorMessage ?? 'Internal server error', 'server_error');
    return;
  }

  const path = req.url ?? '/';

  // Route requests
  if (path.includes('/v1/chat/completions')) {
    handleOpenAIChat(req, res, body, config);
  } else if (path.includes('/v1/messages')) {
    handleAnthropicMessages(req, res, body, config);
  } else if (path.includes('/v1/models')) {
    handleModels(res, config);
  } else if (path.includes('/api/generate') || path.includes('/api/chat')) {
    handleOllamaChat(req, res, body, config);
  } else if (path.includes('/api/tags')) {
    handleOllamaTags(res, config);
  } else {
    sendError(res, 404, 'Not found', 'not_found');
  }
}

function handleOpenAIChat(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  config: MockLLMConfig
): void {
  const request = body as { messages?: Array<{ content: string }> };
  const lastMessage = request?.messages?.[request.messages.length - 1]?.content ?? '';

  const responseContent = getResponseContent(lastMessage, config);

  const response = {
    id: `chatcmpl-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: config.modelName ?? 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  };

  sendJson(res, response);
}

function handleAnthropicMessages(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  config: MockLLMConfig
): void {
  const request = body as { messages?: Array<{ content: string }> };
  const lastMessage = request?.messages?.[request.messages.length - 1]?.content ?? '';

  const responseContent = getResponseContent(lastMessage, config);

  const response = {
    id: `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text: responseContent,
      },
    ],
    model: config.modelName ?? 'claude-3-haiku-20240307',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  };

  sendJson(res, response);
}

function handleOllamaChat(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
  config: MockLLMConfig
): void {
  const request = body as { prompt?: string; messages?: Array<{ content: string }> };
  const prompt =
    request?.prompt ??
    request?.messages?.[request.messages.length - 1]?.content ??
    '';

  const responseContent = getResponseContent(prompt, config);

  const response = {
    model: config.modelName ?? 'llama3.2',
    created_at: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: responseContent,
    },
    done: true,
    total_duration: 1000000000,
    load_duration: 100000000,
    prompt_eval_count: 100,
    eval_count: 50,
    eval_duration: 500000000,
  };

  sendJson(res, response);
}

function handleModels(res: ServerResponse, config: MockLLMConfig): void {
  const response = {
    object: 'list',
    data: [
      {
        id: config.modelName ?? 'gpt-4o-mini',
        object: 'model',
        created: 1677610602,
        owned_by: 'openai',
      },
    ],
  };

  sendJson(res, response);
}

function handleOllamaTags(res: ServerResponse, config: MockLLMConfig): void {
  const response = {
    models: [
      {
        name: config.modelName ?? 'llama3.2',
        model: config.modelName ?? 'llama3.2',
        modified_at: new Date().toISOString(),
        size: 3825819519,
        digest: 'a8c46d2dfb8f',
      },
    ],
  };

  sendJson(res, response);
}

function getResponseContent(prompt: string, config: MockLLMConfig): string {
  // Check pattern-based responses
  if (config.responses) {
    for (const [pattern, response] of config.responses) {
      if (pattern.test(prompt)) {
        return response;
      }
    }
  }

  // Return default response
  return (
    config.defaultResponse ??
    generateDefaultResponse(prompt)
  );
}

function generateDefaultResponse(prompt: string): string {
  // Generate context-aware mock responses based on common prompts
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('question') || lowerPrompt.includes('what')) {
    return JSON.stringify({
      question: 'What does this tool do?',
      category: 'basic_functionality',
      args: {},
    });
  }

  if (lowerPrompt.includes('analyze') || lowerPrompt.includes('analysis')) {
    return 'The tool executed successfully and returned the expected output.';
  }

  if (lowerPrompt.includes('security')) {
    return 'No security vulnerabilities were detected in this tool.';
  }

  if (lowerPrompt.includes('summarize') || lowerPrompt.includes('summary')) {
    return 'This tool provides basic functionality with proper input validation.';
  }

  // Default fallback
  return 'Mock LLM response for testing purposes.';
}

async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : null);
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, data: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = 200;
  res.end(JSON.stringify(data));
}

function sendError(
  res: ServerResponse,
  status: number,
  message: string,
  type: string
): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(
    JSON.stringify({
      error: {
        message,
        type,
        code: status,
      },
    })
  );
}

/**
 * Create response patterns for common interview scenarios.
 */
export function createInterviewResponses(): Map<RegExp, string> {
  return new Map([
    [
      /generate.*question/i,
      JSON.stringify({
        question: 'What happens when invalid input is provided?',
        category: 'error_handling',
        args: { invalid: true },
      }),
    ],
    [
      /analyze.*response/i,
      'The tool handled the input correctly and returned a valid response.',
    ],
    [
      /summarize/i,
      'This tool provides reliable functionality with proper error handling.',
    ],
    [
      /security/i,
      'The tool properly validates input and does not expose sensitive information.',
    ],
  ]);
}

/**
 * Create a mock server that always returns specific content.
 */
export async function createSimpleMockLLMServer(
  response: string
): Promise<MockLLMServer> {
  return createMockLLMServer({
    defaultResponse: response,
    trackRequests: true,
  });
}

/**
 * Create a mock server that fails all requests.
 */
export async function createFailingMockLLMServer(
  errorMessage = 'API error'
): Promise<MockLLMServer> {
  return createMockLLMServer({
    failRequests: true,
    errorMessage,
  });
}
