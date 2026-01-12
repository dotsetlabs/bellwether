# Frequently Asked Questions

## General

### What is Inquest?

Inquest is a behavioral documentation and drift detection tool for MCP (Model Context Protocol) servers. It interviews your MCP server using AI to generate documentation, detect behavioral changes, and identify security issues.

### What is MCP?

MCP (Model Context Protocol) is an open standard for connecting AI assistants to external tools and data sources. MCP servers expose tools that AI agents can call to perform actions like reading files, querying databases, or interacting with APIs.

### Why do I need behavioral documentation?

Traditional API documentation describes what tools *should* do. Behavioral documentation describes what they *actually* do. This helps you:
- Understand real tool behavior through examples
- Detect when behavior changes (drift)
- Find edge cases and error conditions
- Identify security vulnerabilities

## Installation

### What are the system requirements?

- Node.js 20 or later
- An LLM API key (OpenAI, Anthropic, or local Ollama)
- An MCP server to interview

### How do I install Inquest?

```bash
npm install -g @dotsetlabs/inquest
```

Or use directly with npx:

```bash
npx @dotsetlabs/inquest interview <server-command>
```

### Which LLM providers are supported?

- **OpenAI**: GPT-4, GPT-4o, GPT-3.5-turbo
- **Anthropic**: Claude 3.5, Claude 3, Claude 2
- **Ollama**: Any locally-running model

Set the appropriate environment variable:
- `OPENAI_API_KEY` for OpenAI
- `ANTHROPIC_API_KEY` for Anthropic
- No key needed for Ollama (just ensure it's running)

## Configuration

### How do I configure Inquest?

Create an `inquest.yaml` file in your project:

```yaml
llm:
  provider: openai
  model: gpt-4o

interview:
  maxQuestionsPerTool: 10
  timeout: 30000
  personas:
    - technical_writer
    - security_tester

output:
  format: both  # markdown, json, or both
```

Or use `inquest init` to generate one interactively.

### How do I use a different model?

Via configuration:

```yaml
llm:
  provider: anthropic
  model: claude-3-5-sonnet-20241022
```

Or via command line:

```bash
inquest interview --model gpt-4-turbo npx @mcp/my-server
```

### How do I use Ollama locally?

1. Install and run Ollama
2. Pull a model: `ollama pull llama2`
3. Configure Inquest:

```yaml
llm:
  provider: ollama
  model: llama2
  baseUrl: http://localhost:11434
```

## Interviewing

### How long does an interview take?

It depends on:
- Number of tools in your server
- `maxQuestionsPerTool` setting
- Number of personas used
- LLM response time

A typical server with 5-10 tools takes 2-5 minutes.

### Why is the interview slow?

Common causes:
- High `maxQuestionsPerTool` value
- Multiple personas (each runs a full interview)
- Slow LLM responses (try a faster model)
- Network latency to LLM provider

Try reducing questions or using fewer personas:

```yaml
interview:
  maxQuestionsPerTool: 5
  personas:
    - technical_writer  # Use just one persona
```

### Can I interrupt an interview?

In interactive mode (`--interactive`), press Enter to pause/resume, or Ctrl+C to abort.

### What are personas?

Personas are different "interviewer personalities" that focus on different aspects:

- **technical_writer**: Documentation and examples
- **security_tester**: Security vulnerabilities
- **qa_engineer**: Edge cases and errors
- **novice_user**: Usability and error messages

See the [Persona Authoring Guide](./persona-authoring.md) for custom personas.

## Baselines and Drift Detection

### What is a baseline?

A baseline is a snapshot of your server's behavioral state - its tools, schemas, and how they respond to various inputs. Baselines enable drift detection.

### How do I save a baseline?

```bash
inquest interview --save-baseline npx @mcp/my-server
```

This creates `inquest-baseline.json`.

### How do I compare baselines?

```bash
inquest interview --compare-baseline ./baseline.json npx @mcp/my-server
```

Or use Inquest Cloud for version history:

```bash
inquest diff 1 2  # Compare versions 1 and 2
```

### What is "drift"?

Drift is when server behavior changes between baseline versions. Types of drift:
- **Breaking**: Tools removed, required params added
- **Warning**: Schema changes, new optional params
- **Info**: New tools added, documentation changes

### How do I fail CI on drift?

```bash
inquest interview --compare-baseline ./baseline.json --fail-on-drift npx @mcp/my-server
```

This exits with non-zero status if breaking or warning-level drift is detected.

## Inquest Cloud

### What is Inquest Cloud?

Inquest Cloud stores your baselines, tracks version history, and provides team collaboration features. It's optional - Inquest works fully offline.

### How do I sign up?

Visit https://app.inquest.dev to create an account, then:

```bash
inquest login
```

### Is my data secure?

Yes:
- Baselines are encrypted at rest
- HTTPS for all communication
- httpOnly cookies for authentication
- SOC 2 compliance in progress

### What are the plan limits?

| Plan | Projects | Uploads/Month | History |
|------|----------|---------------|---------|
| Free | 1 | 100 | 30 days |
| Pro | 5 | 1,000 | 1 year |
| Team | Unlimited | 10,000 | Unlimited |

### How do I invite team members?

From the dashboard or API:

```bash
# Via API
curl -X POST https://api.inquest.dev/teams/{id}/invite \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email": "colleague@example.com", "role": "member"}'
```

## GitHub Integration

### How do I set up the GitHub App?

1. Visit https://app.inquest.dev/settings/github
2. Click "Install GitHub App"
3. Select repositories to grant access
4. Configure auto-issue and PR check settings

### How do PR checks work?

When configured, Inquest:
1. Creates a check run when a PR is opened
2. Runs interview against the PR branch
3. Compares to main branch baseline
4. Updates check status with drift results

### Can I auto-create issues for breaking changes?

Yes, enable auto-issues in repository settings:

```bash
# Via API
curl -X PATCH https://api.inquest.dev/repos/{id}/settings \
  -d '{"autoIssuesEnabled": true, "autoIssuesSeverityThreshold": "breaking"}'
```

## Webhooks

### How do I set up webhooks?

Via dashboard or API:

```bash
curl -X POST https://api.inquest.dev/projects/{id}/webhooks \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "url": "https://your-server.com/webhook",
    "events": ["baseline.uploaded", "baseline.drift_detected"]
  }'
```

### How do I verify webhook signatures?

Webhooks include an `X-Webhook-Signature` header. Verify with:

```javascript
const crypto = require('crypto');

function verify(payload, signature, secret) {
  const parts = signature.split(',');
  const timestamp = parts.find(p => p.startsWith('t=')).slice(2);
  const sig = parts.find(p => p.startsWith('v1=')).slice(3);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  return sig === expected;
}
```

### What events are available?

- `baseline.uploaded` - New baseline uploaded
- `baseline.drift_detected` - Drift detected between versions
- `baseline.security_finding` - Security issue found

## Troubleshooting

### "Failed to connect to MCP server"

- Verify the server command works: run it directly in terminal
- Check the server starts and doesn't exit immediately
- Ensure the server speaks MCP protocol (stdio transport)
- Try with `--debug` flag for more details

### "No API key found"

Set the appropriate environment variable:

```bash
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
```

Or configure in `inquest.yaml`:

```yaml
llm:
  provider: openai
  apiKeyEnvVar: MY_CUSTOM_KEY_VAR
```

### "No tools found"

Your MCP server may not expose any tools. Verify:

```bash
inquest discover npx @mcp/your-server
```

If no tools appear, check your server's tool registration.

### "Rate limit exceeded"

You've hit the API rate limit. Options:
- Wait for the limit to reset (see `Retry-After` header)
- Upgrade your plan for higher limits
- Reduce interview frequency

### "Baseline hash mismatch"

The uploaded baseline was modified in transit. Try:
1. Re-generate the baseline
2. Check for encoding issues
3. Ensure stable network connection

### Interview produces empty documentation

Common causes:
- Tools have no descriptions
- LLM returned empty responses
- Server tools error on all inputs

Try:
- Adding descriptions to your tools
- Using `--verbose` to see what's happening
- Checking tool error rates in output

## Cost and Performance

### How much does it cost to run an interview?

Costs depend on:
- LLM provider and model
- Number of tools
- Questions per tool
- Number of personas

Use `--estimate-cost` to preview:

```bash
inquest interview --estimate-cost npx @mcp/my-server
```

Typical costs:
- GPT-4o: $0.05-0.20 per interview
- GPT-3.5-turbo: $0.01-0.05 per interview
- Ollama: Free (local)

### How can I reduce costs?

- Use fewer questions: `--max-questions 5`
- Use fewer personas
- Use a cheaper model for initial testing
- Cache results with baselines

### Can I use Inquest in CI/CD?

Yes! See our [CI/CD Guide](./CI_CD.md). Quick example:

```yaml
# GitHub Actions
- name: Run Inquest
  run: |
    inquest interview \
      --save-baseline \
      --fail-on-drift \
      npx @mcp/my-server
```

## Advanced

### Can I create custom personas?

Yes! Create a `.persona.yaml` file:

```yaml
id: my_persona
name: My Custom Persona
systemPrompt: |
  You are a specialized tester...
questionBias:
  happyPath: 0.3
  security: 0.4
  ...
```

See the [Persona Authoring Guide](./persona-authoring.md).

### Can I define custom workflows?

Yes! Create a `.workflow.yaml` file:

```yaml
id: my_workflow
name: My Workflow
steps:
  - tool: first_tool
    args: { ... }
  - tool: second_tool
    argMapping:
      input: "$steps[0].result.output"
```

See the [Workflow Cookbook](./workflow-cookbook.md).

### How do I integrate with other tools?

Inquest outputs multiple formats:
- AGENTS.md for documentation
- JSON for programmatic access
- SARIF for GitHub Security
- JUnit XML for CI systems

```bash
inquest interview --json --sarif npx @mcp/my-server
```

### Where can I get help?

- Documentation: https://inquest.dev/docs
- GitHub Issues: https://github.com/dotsetlabs/inquest/issues
- Discord: https://discord.gg/inquest
- Email: support@inquest.dev
