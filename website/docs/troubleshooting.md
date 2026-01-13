---
title: Troubleshooting
sidebar_position: 101
---

# Troubleshooting

Common issues and how to resolve them.

## Installation Issues

### Node.js Version Error

```
Error: Inquest requires Node.js 20 or later
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
npx @dotsetlabs/inquest interview npx server

# Option 2: Fix npm permissions
sudo chown -R $(whoami) ~/.npm
npm install -g @dotsetlabs/inquest
```

## LLM Provider Issues

### API Key Not Found

```
Error: Failed to initialize LLM client - API key not found
```

**Solution:** Set your API key:

```bash
# OpenAI
export OPENAI_API_KEY=sk-xxx

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-xxx

# Verify it's set
echo $OPENAI_API_KEY
```

For persistent configuration, add to `~/.bashrc` or `~/.zshrc`:

```bash
echo 'export OPENAI_API_KEY=sk-xxx' >> ~/.zshrc
source ~/.zshrc
```

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
- Use `--max-questions 1` to reduce API calls
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

3. **Increase timeout:**
   ```bash
   inquest interview --timeout 60000 npx server
   ```

### Server Crashes

```
Error: Server process exited unexpectedly
```

**Solutions:**

1. **Check server logs:**
   ```bash
   inquest interview --debug npx server
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
inquest discover npx server
```

## Interview Issues

### Timeout During Interview

```
Error: Tool call timed out
```

**Solution:** Increase timeout:

```bash
inquest interview --timeout 120000 npx server
```

### Empty Results

```
Warning: No tools discovered
```

**Solutions:**

1. **Check server supports MCP:**
   ```bash
   inquest discover npx server
   ```

2. **Verify server implementation** returns tools in `tools/list`

### Poor Quality Results

**Solutions:**

1. **Use a better model:**
   ```bash
   inquest interview --model gpt-4o npx server
   ```

2. **Increase questions:**
   ```bash
   inquest interview --max-questions 5 npx server
   ```

3. **Use multiple personas:**
   ```bash
   inquest interview --persona technical_writer,security_tester npx server
   ```

## Drift Detection Issues

### Baseline Not Found

```
Error: Baseline file not found: ./inquest-baseline.json
```

**Solution:** Create a baseline first:

```bash
inquest interview --save-baseline npx server
```

### Unexpected Drift

If you're seeing drift you don't expect:

1. **Review the diff output** to understand what changed

2. **Check if behavior actually changed** vs. LLM interpretation variance

3. **Update baseline if changes are intentional:**
   ```bash
   inquest interview --save-baseline npx server
   git add inquest-baseline.json
   git commit -m "Update baseline"
   ```

## CI/CD Issues

### Exit Code 1 in CI

```
Error: Behavioral drift detected
```

This is expected when drift is found. Options:

1. **Review and fix the drift**
2. **Update the baseline if changes are intentional**
3. **Remove `--fail-on-drift` to allow drift**

### Exit Code 2 in CI

```
Error: Interview failed
```

**Solutions:**

1. **Check API key is set in CI secrets**

2. **Enable debug logging:**
   ```yaml
   - run: |
       inquest interview --debug --log-file debug.log npx server
   - uses: actions/upload-artifact@v4
     if: failure()
     with:
       name: debug-logs
       path: debug.log
   ```

3. **Test locally first:**
   ```bash
   inquest interview --ci npx server
   ```

## Cloud Issues

### Login Failed

```
Error: Authentication failed
```

**Solutions:**

1. **Try logging in again:**
   ```bash
   inquest login --logout
   inquest login
   ```

2. **Check your account at** [inquest.cloud](https://inquest.cloud)

### Upload Failed

```
Error: Failed to upload baseline
```

**Solutions:**

1. **Check you're logged in:**
   ```bash
   inquest login --status
   ```

2. **Verify project is linked:**
   ```bash
   cat .inquest.json
   ```

3. **Re-link if needed:**
   ```bash
   inquest link
   ```

## Debug Mode

For detailed troubleshooting, enable debug mode:

```bash
inquest interview \
  --debug \
  --log-level debug \
  --log-file ./debug.log \
  npx server
```

This logs:
- MCP protocol messages
- LLM requests and responses
- Tool call details
- Timing information

## Getting Help

If these solutions don't help:

1. **Search existing issues:** [github.com/dotsetlabs/inquest/issues](https://github.com/dotsetlabs/inquest/issues)

2. **Open a new issue** with:
   - Inquest version (`inquest --version`)
   - Node.js version (`node --version`)
   - Command you ran
   - Full error message
   - Debug log if available

3. **Ask in Discussions:** [github.com/dotsetlabs/inquest/discussions](https://github.com/dotsetlabs/inquest/discussions)
