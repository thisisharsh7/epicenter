#!/bin/bash
# Test the MCP server with the inspector

echo "Starting MCP Inspector..."
echo ""
echo "This will:"
echo "1. Start your content-hub MCP server"
echo "2. Open the inspector UI in your browser"
echo "3. Let you test all tools interactively"
echo ""

bunx @modelcontextprotocol/inspector bun "$(dirname "$0")/server-stdio.ts"
