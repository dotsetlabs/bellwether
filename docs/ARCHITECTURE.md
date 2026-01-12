# Inquest Architecture

This document describes the high-level architecture of Inquest, an automated behavioral documentation tool for MCP (Model Context Protocol) servers.

## Overview

Inquest interviews MCP servers using LLM-guided questioning to generate comprehensive behavioral documentation. It discovers server capabilities, executes tool calls with various inputs, and synthesizes findings into actionable documentation.

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLI Layer                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │interview │  │ discover │  │   init   │  │ compare  │        │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └────┬─────┘        │
└───────┼─────────────┼───────────────────────────┼───────────────┘
        │             │                           │
        ▼             ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Core Layer                                │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │Orchestrator│  │ Discovery │  │  Persona  │  │ Baseline  │    │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘    │
│        │              │              │              │            │
│        ▼              │              │              │            │
│  ┌───────────┐        │              │              │            │
│  │Interviewer│◄───────┴──────────────┘              │            │
│  └─────┬─────┘                                      │            │
│        │                                            │            │
│        ▼                                            ▼            │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │ Workflow  │  │    LLM    │  │  Docs Gen │  │Comparator │    │
│  │ Executor  │  │  Factory  │  │           │  │           │    │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └───────────┘    │
└────────┼──────────────┼──────────────┼──────────────────────────┘
         │              │              │
         ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Infrastructure Layer                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │MCP Client │  │  OpenAI   │  │ Anthropic │  │  Ollama   │    │
│  │(Transport)│  │ Provider  │  │ Provider  │  │ Provider  │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Module Structure

```
src/
├── cli/                    # Command-line interface
│   ├── index.ts           # Main entry point, global options
│   └── commands/
│       ├── interview.ts   # Main interview command
│       ├── discover.ts    # Capability discovery only
│       └── init.ts        # Configuration initialization
│
├── transport/             # MCP protocol communication
│   ├── types.ts          # MCP message types
│   ├── stdio-transport.ts # Stdio transport implementation
│   └── mcp-client.ts     # High-level MCP client
│
├── discovery/            # Server capability discovery
│   ├── types.ts         # Discovery result types
│   └── discovery.ts     # Capability enumeration
│
├── interview/           # Interview orchestration
│   ├── types.ts        # Interview types (questions, profiles)
│   ├── orchestrator.ts # Multi-persona coordination
│   └── interviewer.ts  # Single-persona interviewing
│
├── persona/            # Interviewer personalities
│   ├── types.ts       # Persona type definitions
│   ├── builtins.ts    # Built-in persona definitions
│   └── loader.ts      # YAML persona loading
│
├── workflow/          # Chained tool execution
│   ├── types.ts      # Workflow type definitions
│   ├── executor.ts   # Workflow execution engine
│   ├── discovery.ts  # LLM-based workflow discovery
│   └── loader.ts     # YAML workflow loading
│
├── baseline/         # Behavioral drift detection
│   ├── types.ts     # Baseline/diff types
│   ├── saver.ts     # Baseline persistence
│   ├── comparator.ts # Behavioral comparison
│   └── diff.ts      # Diff formatting
│
├── llm/             # LLM provider abstraction
│   ├── client.ts   # Provider interface
│   ├── factory.ts  # Provider instantiation
│   ├── openai.ts   # OpenAI implementation
│   ├── anthropic.ts # Anthropic implementation
│   └── ollama.ts   # Ollama implementation
│
├── docs/           # Documentation generation
│   ├── generator.ts      # AGENTS.md generator
│   ├── html-reporter.ts  # Interactive HTML reports
│   ├── sarif-reporter.ts # SARIF for code scanning
│   ├── junit-reporter.ts # JUnit XML for CI
│   └── templates.ts      # Shared templates
│
├── logging/       # Structured logging
│   └── logger.ts # Pino-based logger
│
├── config/       # Configuration management
│   └── loader.ts # YAML config loading
│
├── ci/          # CI/CD integration
│   └── index.ts # CI mode helpers
│
└── index.ts    # Public API exports
```

## Core Components

### MCP Client (`transport/`)

The MCP client handles communication with MCP servers via stdio transport.

**Key Classes:**
- `StdioTransport` - Low-level message framing and buffering
- `MCPClient` - High-level client with connection management, request/response handling

**Flow:**
```
Client Request → JSON-RPC Envelope → Newline-delimited message → Server
Server Response → Buffer → Complete message detection → JSON-RPC Parse → Client
```

### Discovery (`discovery/`)

Discovers server capabilities by calling MCP introspection methods.

**Operations:**
1. `initialize` - Get server info and protocol version
2. `tools/list` - Enumerate available tools
3. `prompts/list` - Enumerate available prompts
4. `resources/list` - Enumerate resources (if supported)

### Interviewer (`interview/`)

The interviewer generates questions and analyzes responses for each tool.

**Interview Loop:**
```
For each tool:
  1. Generate questions based on persona bias
  2. Execute tool calls with generated inputs
  3. Analyze responses for behavioral patterns
  4. Record findings (behavior, limitations, security)
```

**Question Categories:**
- `happy_path` - Normal, expected usage
- `edge_case` - Boundary values, unusual inputs
- `error_handling` - Invalid inputs, error conditions
- `boundary` - Limits and constraints
- `security` - Injection, traversal, etc.

### Persona System (`persona/`)

Personas shape the interviewer's focus and question style.

**Built-in Personas:**
| ID | Focus | Style |
|----|-------|-------|
| `technical_writer` | Documentation | Balanced, realistic examples |
| `security_tester` | Vulnerabilities | Injection attempts, boundary violations |
| `qa_engineer` | Edge cases | Unusual inputs, error conditions |
| `novice_user` | UX/Errors | Invalid formats, unclear errors |

**Custom Personas:**
Define in YAML with `systemPrompt`, `questionBias`, and `categories`.

### Workflow Executor (`workflow/`)

Tests tools in combination to verify realistic usage patterns.

**Workflow Features:**
- Step chaining with output-to-input mapping
- JSONPath-based argument resolution
- Assertions for validation
- LLM-based workflow discovery

**Execution Flow:**
```
Workflow → Step 1 → Resolve args → Call tool → Assert → Extract outputs
                                                              │
       ┌──────────────────────────────────────────────────────┘
       ▼
Step 2 → Resolve args (from step 1) → Call tool → Assert → ...
```

### LLM Factory (`llm/`)

Provides a unified interface for multiple LLM providers.

**Provider Interface:**
```typescript
interface LLMProvider {
  chat(messages: Message[]): Promise<string>;
  chatJSON<T>(messages: Message[], schema: object): Promise<T>;
}
```

**Provider Selection:**
1. Explicit via config: `llm.provider: anthropic`
2. Auto-detect from environment variables
3. Default: OpenAI

### Documentation Generator (`docs/`)

Generates multiple output formats from interview results.

**Formats:**
- `AGENTS.md` - Comprehensive Markdown documentation
- `HTML` - Interactive report with filtering/search
- `JSON` - Machine-readable full results
- `SARIF` - GitHub Code Scanning integration
- `JUnit` - CI test runner integration

### Baseline Comparator (`baseline/`)

Detects behavioral drift between interview runs.

**Comparison Aspects:**
- Tools added/removed
- Schema changes
- Behavioral changes (response format, error handling)
- Security findings

**Severity Classification:**
- `none` - No changes
- `info` - Minor documentation changes
- `warning` - Behavioral changes to investigate
- `breaking` - Critical changes requiring attention

## Data Flow

### Complete Interview Flow

```
1. CLI parses arguments and loads config
2. MCP Client connects to server
3. Discovery enumerates capabilities
4. For each persona:
   a. Interviewer generates questions
   b. Tool calls are executed
   c. Responses are analyzed
   d. Findings are recorded
5. Workflow discovery (optional)
6. Workflow execution (optional)
7. Results aggregation
8. Documentation generation
9. Baseline comparison (optional)
10. Exit code determination
```

### Type Flow

```
MCPTool → InterviewQuestion → MCPToolCallResult → ToolInteraction
                                                        │
                                                        ▼
                                                  ToolProfile
                                                        │
                                                        ▼
                                               InterviewResult
                                                        │
                    ┌───────────────────────────────────┼───────────────────┐
                    ▼                                   ▼                   ▼
               AGENTS.md                          HTML Report          JSON Report
```

## Configuration

### Config File Locations

1. Explicit path: `--config ./path/to/config.yaml`
2. Current directory: `inquest.yaml`, `.inquest.yaml`
3. Home directory: `~/.inquest/inquest.yaml`

### Config Sections

```yaml
version: 1
llm:
  provider: openai|anthropic|ollama
  model: model-name
  apiKeyEnvVar: ENV_VAR_NAME
  baseUrl: http://...  # for proxies/Ollama
interview:
  maxQuestionsPerTool: 3
  timeout: 30000
  skipErrorTests: false
  personas: [technical_writer, security_tester]
output:
  format: agents.md|json|both
  outputDir: ./docs
```

## Extension Points

### Custom Personas

Create YAML files implementing the `PersonaYAML` interface:

```yaml
id: my_persona
name: My Custom Persona
systemPrompt: "You are..."
questionBias:
  happyPath: 0.4
  edgeCase: 0.3
  errorHandling: 0.2
  boundary: 0.1
categories: [happy_path, edge_case]
```

### Custom Workflows

Define tool sequences in YAML:

```yaml
workflows:
  - id: my_workflow
    name: My Workflow
    steps:
      - tool: tool_a
        args: { param: value }
      - tool: tool_b
        argMapping:
          input: "$steps[0].result.output"
```

### Custom LLM Providers

Implement the `LLMProvider` interface and register in the factory.

## Testing Strategy

### Test Categories

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `test/**/*.test.ts` | Component isolation |
| Fixtures | `test/fixtures/` | Mocks and sample data |
| Integration | (future) | End-to-end flows |

### Mock Infrastructure

- `MockMCPServer` - Spawnable test server
- `MockLLMClient` - Deterministic LLM responses
- `sample-tools.ts` - Standard tool definitions

## Error Handling

### Error Categories

1. **Connection Errors** - MCP server communication failures
2. **Protocol Errors** - Invalid MCP messages
3. **LLM Errors** - Provider API failures
4. **Validation Errors** - Config/schema validation
5. **Runtime Errors** - Unexpected conditions

### Error Propagation

```
Low-level error → Wrapped with context → Logged → CLI exit code
```

## Performance Considerations

- **Parallel execution** - Future: parallel tool testing when safe
- **LLM caching** - Future: cache repeated questions
- **Lazy loading** - Large schemas loaded on demand
- **Streaming** - Progress callbacks for long interviews

## Security

- API keys via environment variables (never in config files)
- Security persona tests injection/traversal patterns
- SARIF output for security scanning integration
- No credential logging (redacted in debug output)
