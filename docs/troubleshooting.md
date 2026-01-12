# Troubleshooting Guide

This guide covers common issues and their solutions when using Inquest.

## Installation Issues

### npm install fails

**Error:** `npm ERR! code EACCES`

**Solution:** Don't use sudo. Fix npm permissions:
```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

### Node version incompatibility

**Error:** `SyntaxError: Unexpected token`

**Solution:** Inquest requires Node.js 20+. Check your version:
```bash
node --version
```

## LLM Provider Issues

### OpenAI API Key Not Found

**Error:**
```
Failed to initialize LLM client: API key not found
```

**Solution:**
```bash
export OPENAI_API_KEY=sk-your-key-here
```

Or add to your shell profile (~/.bashrc, ~/.zshrc).

### Anthropic API Key

**Error:**
```
Failed to initialize LLM client
Provider: anthropic
```

**Solution:**
```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### Rate Limit Errors

**Error:**
```
Error: 429 Too Many Requests
```

**Solutions:**
1. Wait and retry - Inquest has automatic retry with backoff
2. Use a model with higher rate limits
3. Reduce `maxQuestionsPerTool` in config
4. Use a local Ollama model for development

### Token Quota Exceeded

**Error:**
```
Error: insufficient_quota
```

**Solution:** Check your API provider account for billing issues or upgrade your plan.

## MCP Server Issues

### Server Won't Connect

**Error:**
```
Failed to connect to MCP server
```

**Possible causes:**

1. **Server command incorrect:**
   ```bash
   # Make sure the command runs standalone first
   npx @modelcontextprotocol/server-filesystem /tmp
   ```

2. **Missing dependencies:**
   ```bash
   npm install  # In server directory
   ```

3. **Server crashes on startup:**
   Add `--debug` flag to see server output:
   ```bash
   inquest interview npx your-server --debug
   ```

### No Tools Found

**Error:**
```
No tools found. Nothing to interview.
```

**Possible causes:**

1. Server doesn't implement tool capabilities
2. Server requires specific initialization
3. Wrong server command

**Solution:** Test the server with MCP Inspector first:
```bash
npx @modelcontextprotocol/inspector npx your-server
```

### Tool Call Timeout

**Error:**
```
Tool call timed out after 60000ms
```

**Solution:** Increase timeout:
```bash
inquest interview npx your-server --timeout 120000
```

Or in config:
```yaml
interview:
  timeout: 120000
```

## Baseline Issues

### Baseline File Not Found

**Error:**
```
Baseline file not found: ./inquest-baseline.json
```

**Solution:** Create a baseline first:
```bash
inquest interview npx your-server --save-baseline
```

### Baseline Format Error

**Error:**
```
Failed to parse baseline JSON
```

**Solution:** The baseline file may be corrupted. Regenerate it:
```bash
inquest interview npx your-server --save-baseline
```

### False Positive Drift Detection

**Symptom:** Drift detected when behavior hasn't changed.

**Possible causes:**
1. Non-deterministic tool responses
2. Timestamps or dynamic data in responses
3. Random ordering of results

**Solutions:**
1. Review the diff to understand what changed
2. Add relevant assertions to ignore known variations
3. Use `--verbose` to see detailed comparisons

## Cloud Integration Issues

### Login Failed

**Error:**
```
Login failed: Invalid token
```

**Solution:**
1. Re-run `inquest login`
2. Check your Inquest Cloud account status
3. Verify network connectivity

### Upload Failed

**Error:**
```
Failed to upload baseline
```

**Possible causes:**
1. Network issues
2. Invalid project ID
3. Plan limits exceeded

**Solutions:**
1. Check `inquest projects` to verify project exists
2. Check your plan's upload limits
3. Retry with `--verbose` for more details

### Project Not Found

**Error:**
```
Project 'my-project' not found
```

**Solution:**
```bash
# List your projects
inquest projects

# Create if missing
inquest link --create my-project
```

## Performance Issues

### Interview Takes Too Long

**Solutions:**

1. Reduce questions per tool:
   ```bash
   inquest interview npx your-server --max-questions 3
   ```

2. Use fewer personas:
   ```yaml
   interview:
     personas:
       - user  # Just one persona
   ```

3. Use a faster model:
   ```yaml
   llm:
     provider: openai
     model: gpt-4o-mini  # Faster and cheaper
   ```

### High API Costs

**Solutions:**

1. Use `--estimate-cost` before running
2. Use local Ollama models for development
3. Reduce question count
4. Cache results (coming soon)

## Debug Mode

For detailed debugging, combine these flags:

```bash
inquest interview npx your-server \
  --verbose \
  --debug \
  --log-level debug \
  --log-file ./inquest-debug.log
```

This will:
- Show verbose interview progress
- Log MCP protocol messages
- Write detailed logs to file

## Getting More Help

### Report a Bug

Include in your report:
1. Inquest version: `inquest --version`
2. Node version: `node --version`
3. OS and version
4. Full command used
5. Error message and stack trace
6. Log file if available

Submit at: https://github.com/dotsetlabs/inquest/issues

### Community Support

- GitHub Discussions: https://github.com/dotsetlabs/inquest/discussions
- Discord: https://discord.gg/inquest
