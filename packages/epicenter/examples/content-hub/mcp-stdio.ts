#!/usr/bin/env bun
/**
 * Epicenter MCP Server - stdio Transport
 *
 * This is the standard way to run an MCP server using stdin/stdout communication.
 * Unlike the HTTP transport, this doesn't require managing a separate server process.
 *
 * Usage with Claude Code:
 *
 * Add to ~/.claude.json:
 * {
 *   "mcpServers": {
 *     "epicenter-content-hub": {
 *       "command": "bun",
 *       "args": ["/path/to/mcp-stdio.ts"]
 *     }
 *   }
 * }
 *
 * Or using the CLI:
 * claude mcp add epicenter-content-hub --scope user -- bun /path/to/mcp-stdio.ts
 */

import { createStdioServer, defineEpicenter } from '../../src/index';
import { pages } from './epicenter.config';

// Define your Epicenter app
const contentHub = defineEpicenter({
	id: 'content-hub',
	workspaces: [pages],
});

// Start the stdio MCP server
await createStdioServer(contentHub);
