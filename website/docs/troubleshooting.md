---
title: Troubleshooting
sidebar_position: 101
---

# Troubleshooting

Common issues and how to resolve them.

## Installation Issues

### Node.js Version Error

```
Error: Bellwether requires Node.js 20 or later
```

**Solution:** Update Node.js:

```bash
# Check version
node --version

# Use nvm to install/switch
nvm install 20
nvm use 20
```

### Permission Denied (Global Install)

```
EACCES: permission denied
```

**Solution:** Fix npm permissions or use npx:

```bash
# Option 1: Use npx (no install needed)
npx @dotsetlabs/bellwether check npx server

# Option 2: Fix npm permissions
sudo chown -R $(whoami) ~/.npm
npm install -g @dotsetlabs/bellwether
```

## LLM Provider Issues

These issues only apply to `bellwether explore`. The `bellwether check` command doesn't use LLMs.

### API Key Not Found

```
Error: Failed to initialize LLM client - API key not found
```

**Solution:** Set up your API key using one of these methods:

```bash
# Option 1: Interactive setup (recommended)
bellwether auth

# Option 2: Environment variable
export OPENAI_API_KEY=sk-xxx
# or
export ANTHROPIC_API_KEY=sk-ant-xxx

# Verify configuration
bellwether auth status
```

For persistent storage, `bellwether auth` stores your key in the system keychain (most secure) or in `~/.bellwether/.env`.

### Invalid API Key

```
Error: 401 Unauthorized
```

**Solution:**
1. Verify your API key is correct
2. Check the key hasn't expired
3. Ensure you have API access (not just ChatGPT access)

### Rate Limiting

```
Error: 429 Too Many Requests
```

**Solution:**
- Wait and retry
- Reduce `explore.maxQuestionsPerTool` in bellwether.yaml
- Consider upgrading your API plan

### Ollama Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:11434
```

**Solution:** Start Ollama:

```bash
# Start Ollama server
ollama serve

# Verify it's running
curl http://localhost:11434/api/tags
```

## MCP Server Issues

### Connection Failed

```
Error: Failed to connect to MCP server
```

**Solutions:**

1. **Verify the command works:**
   ```bash
   # Test the server directly
   npx @modelcontextprotocol/server-filesystem /tmp
   ```

2. **Check for missing dependencies:**
   ```bash
   npm install
   ```

3. **Increase timeout in bellwether.yaml:**
   ```yaml
   server:
     timeout: 60000
   ```

### Server Crashes

```
Error: Server process exited unexpectedly
```

**Solutions:**

1. **Enable debug logging** in `bellwether.yaml`:
   ```yaml
   logging:
     level: debug
     verbose: true
   ```

2. **Test server independently:**
   ```bash
   npx server 2>&1
   ```

3. **Check for missing environment variables** the server needs

### Tool Not Found

```
Error: Tool 'my_tool' not found
```

**Solution:** Verify available tools:

```bash
bellwether discover npx server
```

## Check Mode Issues

### Timeout During Check

```
Error: Tool call timed out
```

**Solution:** Increase timeout in bellwether.yaml:

```yaml
server:
  timeout: 120000
```

### Empty Results

```
Warning: No tools discovered
```

**Solutions:**

1. **Check server supports MCP:**
   ```bash
   bellwether discover npx server
   ```

2. **Verify server implementation** returns tools in `tools/list`

## Explore Mode Issues

### Poor Quality Results

**Solutions:**

1. **Use a better model in bellwether.yaml:**
   ```yaml
   llm:
     provider: anthropic
     model: claude-sonnet-4-5
   ```

2. **Increase questions:**
   ```yaml
   explore:
     maxQuestionsPerTool: 5
   ```

3. **Use multiple personas:**
   ```yaml
   explore:
     personas:
       - technical_writer
       - security_tester
       - qa_engineer
       - novice_user
   ```

## Drift Detection Issues

### Baseline Not Found

```
Error: Baseline file not found: ./bellwether-baseline.json
```

**Solution:** Create a baseline first:

```bash
bellwether check npx server
bellwether baseline save
```

### Unexpected Drift

If you're seeing drift you don't expect:

1. **Review the diff output** to understand what changed

2. **Check if schemas actually changed** in the server

3. **Update baseline if changes are intentional:**
   ```bash
   bellwether check npx server
   bellwether baseline save --force
   git add .bellwether/bellwether-baseline.json
   git commit -m "Update baseline"
   ```

### Version Mismatch Error

```
Error: Version Compatibility Error
```

**Solution:** Recreate your baseline with the latest CLI:

```bash
bellwether check
bellwether baseline save
```

Or force comparison (results may be less accurate):

```bash
bellwether baseline compare ./old-baseline.json --ignore-version-mismatch
```

## CI/CD Issues

### Exit Code 1 in CI

```
Error: Drift detected
```

This is expected when drift is found. Options:

1. **Review and fix the drift**
2. **Update the baseline if changes are intentional**
3. **Handle exit codes in CI to allow info/warning changes**

### API Key Not Found in CI

**Solutions:**

1. **For check mode:** No API key needed! Make sure you're using `bellwether check`, not `bellwether explore`.

2. **For explore mode:** Set the secret in your CI configuration:

   GitHub Actions:
   ```yaml
   env:
     OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
   ```

3. **Enable debug logging** in `bellwether.yaml`:
   ```yaml
   logging:
     level: debug
     verbose: true
   ```
   Then capture output in CI:
   ```yaml
   - run: npx @dotsetlabs/bellwether check 2>&1 | tee bellwether.log
   - uses: actions/upload-artifact@v4
     if: failure()
     with:
       name: debug-logs
       path: bellwether.log
   ```

## Debug Mode

For detailed troubleshooting, enable debug mode in `bellwether.yaml`:

```yaml
logging:
  level: debug
  verbose: true
```

Then run your command normally:

```bash
bellwether check
```

This logs:
- MCP protocol messages
- Tool call details
- Timing information

For explore mode:
```bash
bellwether explore
```

This also logs:
- LLM requests and responses

## Getting Help

If these solutions don't help:

1. **Search existing issues:** [github.com/dotsetlabs/bellwether/issues](https://github.com/dotsetlabs/bellwether/issues)

2. **Open a new issue** with:
   - Bellwether version (`bellwether --version`)
   - Node.js version (`node --version`)
   - Command you ran
   - Full error message
   - Debug log if available

3. **Ask in Discussions:** [github.com/dotsetlabs/bellwether/discussions](https://github.com/dotsetlabs/bellwether/discussions)
