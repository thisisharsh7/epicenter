#!/usr/bin/env bun

/**
 * MCP Server for content-hub workspace
 *
 * This exposes all workspace actions as MCP tools for Claude Desktop.
 *
 * To use with Claude Desktop, add to your MCP settings:
 * {
 *   "mcpServers": {
 *     "content-hub": {
 *       "command": "bun",
 *       "args": ["run", "/path/to/mcp-server.ts"]
 *     }
 *   }
 * }
 */

import { createWorkspaceMCPServer } from '../../src/server';
import workspace from './epicenter.config';

// Start MCP server on stdio
await createWorkspaceMCPServer(workspace);
