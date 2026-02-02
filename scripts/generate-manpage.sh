#!/bin/bash
# Generate man page from README.md using pandoc
# Usage: ./scripts/generate-manpage.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

MAN_SECTION="1"
MAN_DATE="$(date +%Y-%m-%d)"
MAN_VERSION="$(node -p "require('$PROJECT_ROOT/package.json').version")"
MAN_NAME="bellwether"
MAN_TITLE="Bellwether MCP Testing Tool"

echo "Generating man page for $MAN_NAME v$MAN_VERSION..."

# Check if pandoc is available
if ! command -v pandoc &> /dev/null; then
    echo "Warning: pandoc not found. Installing via npm..."
    npm install -g pandoc-bin 2>/dev/null || {
        echo "Error: Could not install pandoc. Please install manually:"
        echo "  macOS: brew install pandoc"
        echo "  Ubuntu/Debian: apt-get install pandoc"
        echo "  Or visit: https://pandoc.org/installing.html"
        exit 1
    }
fi

# Create man page directory
mkdir -p "$PROJECT_ROOT/man"

# Generate man page from README
cat > "$PROJECT_ROOT/man/$MAN_NAME.$MAN_SECTION.md" << 'EOF'
---
title: BELLWETHER
section: 1
header: User Commands
footer: Bellwether $MAN_VERSION
date: $MAN_DATE
---

# NAME

bellwether — MCP server testing and validation tool

# SYNOPSIS

**bellwether** [OPTIONS] COMMAND [ARGS...]

**bellwether** **--version**

**bellwether** **--help**

# DESCRIPTION

Bellwether is an open-source MCP (Model Context Protocol) testing tool that provides
structural drift detection and behavioral documentation for MCP servers.

# COMMANDS

**check** [*options*] [server-command]
:   Schema validation and drift detection (free, fast, deterministic)

**explore** [*options*] [server-command]
:   LLM-powered behavioral exploration and documentation

**discover** [*options*] [server-command]
:   Discover MCP server capabilities (tools, prompts, resources)

**watch** [*options*]
:   Watch for MCP server changes and auto-check

**init** [*options*] [server-command]
:   Initialize a bellwether.yaml configuration file

**auth** *subcommand* [*options*]
:   Manage LLM provider API keys

**baseline** *subcommand* [*options*]
:   Manage baselines for drift detection

**golden** *subcommand* [*options*]
:   Manage golden outputs for validation

**registry** [*options*] *search*
:   Search the MCP Registry for servers

**contract** *subcommand* [*options*]
:   Validate MCP servers against contracts

**validate-config** [*options*]
:   Validate bellwether.yaml configuration

# GLOBAL OPTIONS

**-h**, **--help**
:   Show help message and exit

**--version**
:   Show version information and exit

**--log-level** *LEVEL*
:   Set log level: debug, info, warn, error, silent

**--log-file** *PATH*
:   Write logs to file instead of stderr

# EXAMPLES

Initialize configuration:

    bellwether init npx @modelcontextprotocol/server-filesystem

Run drift detection:

    bellwether check

Save baseline:

    bellwether baseline save

Explore with LLM:

    bellwether explore

# FILES

*bellwether.yaml*
:   Configuration file for the project

*bellwether-baseline.json*
:   Saved baseline for drift detection

*CONTRACT.md*
:   Generated contract documentation

*AGENTS.md*
:   Generated behavioral documentation

# ENVIRONMENT

*OPENAI_API_KEY*
:   API key for OpenAI (explore mode only)

*ANTHROPIC_API_KEY*
:   API key for Anthropic (explore mode only)

*OLLAMA_BASE_URL*
:   Ollama URL (default: http://localhost:11434)

# EXIT STATUS

**0**
:   Success, no changes detected

**1**
:   Info-level changes only

**2**
:   Warning-level changes

**3**
:   Breaking changes detected

**4**
:   Runtime error

**5**
:   Low confidence metrics

# SEE ALSO

Project homepage: <https://github.com/dotsetlabs/bellwether>

Documentation: <https://docs.bellwether.sh>

MCP Specification: <https://modelcontextprotocol.io>

# AUTHORS

Dotset Labs LLC <hello@dotsetlabs.com>
EOF

# Substitute variables
sed -i.bak "s/\$MAN_VERSION/$MAN_VERSION/g" "$PROJECT_ROOT/man/$MAN_NAME.$MAN_SECTION.md"
sed -i.bak "s/\$MAN_DATE/$MAN_DATE/g" "$PROJECT_ROOT/man/$MAN_NAME.$MAN_SECTION.md"
rm -f "$PROJECT_ROOT/man/$MAN_NAME.$MAN_SECTION.md.bak"

# Convert to man page
pandoc "$PROJECT_ROOT/man/$MAN_NAME.$MAN_SECTION.md" \
    -s -t man \
    -o "$PROJECT_ROOT/man/$MAN_NAME.$MAN_SECTION"

echo "Man page generated: man/$MAN_NAME.$MAN_SECTION"
echo ""
echo "To install:"
echo "  sudo cp man/$MAN_NAME.$MAN_SECTION /usr/local/share/man/man$MAN_SECTION/"
echo "  sudo mandb  # Update man database"
