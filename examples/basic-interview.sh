#!/bin/bash
# Basic Bellwether Interview Examples
# Run these from your project root

set -e

echo "=== Bellwether Basic Interview Examples ==="
echo ""

# Example 1: Simple interview with default settings
echo "Example 1: Basic interview"
echo "  bellwether interview npx @modelcontextprotocol/server-filesystem ./data"
echo ""

# Example 2: Interview with specific model
echo "Example 2: Using a specific model"
echo "  bellwether interview --model gpt-4o npx @mcp/server"
echo ""

# Example 3: Interview with multiple personas
echo "Example 3: Multi-persona comprehensive interview"
echo "  bellwether interview --persona technical_writer,security_tester,qa_engineer npx @mcp/server"
echo ""

# Example 4: Interview with custom config
echo "Example 4: Using a config file"
echo "  bellwether interview --config ./bellwether.yaml npx @mcp/server"
echo ""

# Example 5: Generate both markdown and JSON output
echo "Example 5: Multiple output formats"
echo "  bellwether interview --json -o ./docs npx @mcp/server"
echo ""

# Example 6: Verbose output with debug logging
echo "Example 6: Debug mode"
echo "  bellwether interview --verbose --debug --log-level debug npx @mcp/server"
echo ""

# Example 7: Discover and test workflows
echo "Example 7: Workflow discovery"
echo "  bellwether interview --discover-workflows npx @mcp/server"
echo ""

# Example 8: Use predefined workflows
echo "Example 8: Custom workflows"
echo "  bellwether interview --workflows ./workflows.yaml npx @mcp/server"
echo ""

# Example 9: CI mode with baseline comparison
echo "Example 9: CI/CD integration"
echo "  bellwether interview --ci --baseline-file ./baseline.json --fail-on-drift npx @mcp/server"
echo ""

# Example 10: Save a baseline for future comparisons
echo "Example 10: Create baseline"
echo "  bellwether interview --save-baseline ./baseline.json npx @mcp/server"
echo ""

echo "=== Discovery Command ==="
echo ""

# Quick capability discovery without full interview
echo "Discover server capabilities (no interview):"
echo "  bellwether discover npx @mcp/server"
echo ""

echo "=== Tips ==="
echo ""
echo "- Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or configure Ollama for LLM access"
echo "- Use --log-file to save logs for debugging"
echo "- Use --timeout to adjust tool call timeout (default: 30000ms)"
echo "- Combine multiple personas for comprehensive behavioral documentation"
