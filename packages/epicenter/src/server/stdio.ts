import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { EpicenterConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import { setupMcpHandlers } from './mcp-handlers';

/**
 * Create and run an MCP server using stdio transport
 *
 * This creates an MCP server that communicates via stdin/stdout.
 * This is the standard transport for local MCP servers.
 *
 * @param config - Epicenter configuration with workspaces
 *
 * @example
 * ```typescript
 * // mcp-server.ts
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [blogWorkspace],
 * });
 *
 * await createStdioServer(epicenter);
 * ```
 *
 * Then add to Claude Code:
 * ```bash
 * claude mcp add my-app --scope user -- bun /path/to/mcp-server.ts
 * ```
 */
export async function createStdioServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): Promise<void> {
	// Create client
	const client = await createEpicenterClient(config);

	// Create MCP server
	const mcpServer = new McpServer(
		{
			name: config.id,
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {
					listChanged: false,
				},
			},
		}
	);

	// Setup MCP handlers (tools/list and tools/call)
	setupMcpHandlers(mcpServer, client, config.workspaces);

	// Connect to stdio transport
	const transport = new StdioServerTransport();
	await mcpServer.connect(transport);

	// Log to stderr (stdout is used for MCP communication)
	console.error(`MCP server "${config.id}" running on stdio transport`);
}
