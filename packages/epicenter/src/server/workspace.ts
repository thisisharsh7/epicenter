import { Hono } from 'hono';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
	McpError,
	ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { Value } from 'typebox/value';
import type { WorkspaceActionMap } from '../core/actions';
import type { WorkspaceIndexMap } from '../core/indexes';
import type { WorkspaceSchema } from '../core/schema';
import type { AnyWorkspaceConfig, WorkspaceConfig } from '../core/workspace';
import { createWorkspaceClient } from '../core/workspace';
import { executeAction } from './utils';

/**
 * Create a Hono HTTP server from a Workspace configuration
 * Exposes all workspace actions as REST endpoints AND MCP protocol endpoint
 *
 * @param config - Workspace configuration
 * @returns Hono app instance
 *
 * @example
 * ```typescript
 * const app = await createWorkspaceServer(blogWorkspace);
 *
 * Bun.serve({
 *   fetch: app.fetch,
 *   port: 3001,
 * });
 *
 * // REST endpoints:
 * // GET  /getAllPosts
 * // POST /createPost
 * // MCP endpoint:
 * // POST /mcp (handles MCP protocol over HTTP)
 * ```
 */
export async function createWorkspaceServer<
	TDeps extends readonly AnyWorkspaceConfig[],
	TId extends string,
	TVersion extends number,
	TName extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	TIndexes extends WorkspaceIndexMap,
	TActionMap extends WorkspaceActionMap,
>(
	config: WorkspaceConfig<
		TDeps,
		TId,
		TVersion,
		TName,
		TWorkspaceSchema,
		TIndexes,
		TActionMap
	>,
): Promise<Hono> {
	const app = new Hono();

	// Initialize workspace client (already has all actions with metadata)
	const client = await createWorkspaceClient(config);

	// Register each action as a REST endpoint
	for (const [actionName, handler] of Object.entries(client)) {
		// Skip non-action methods
		if (typeof handler !== 'function' || actionName === 'destroy') continue;

		const path = `/${actionName}`;

		// Register as both GET and POST
		app.get(path, async (c) => {
			const query = c.req.query();
			const input = Object.keys(query).length > 0 ? query : undefined;
			return executeAction(c, handler, input);
		});

		app.post(path, async (c) => {
			const body = await c.req.json().catch(() => ({}));
			const input = Object.keys(body).length > 0 ? body : undefined;
			return executeAction(c, handler, input);
		});
	}

	// Create MCP server for /mcp endpoint
	const mcpServer = new McpServer(
		{
			name: config.name,
			version: `${config.version}`,
		},
		{
			capabilities: {
				tools: {
					listChanged: false,
				},
			},
		},
	);

	// List tools - iterate over client's action methods
	mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: Object.entries(client)
			.filter(([key, value]) => typeof value === 'function' && key !== 'destroy')
			.map(([name, action]) => ({
				name,
				title: name,
				description: (action as any).description,
				inputSchema: (action as any).input || { type: 'object' as const, properties: {} },
			})),
	}));

	// Call tool - validate with TypeBox, execute action
	mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
		const action = (client as any)[request.params.name];

		// Check if action exists and is valid
		if (!action || typeof action !== 'function' || request.params.name === 'destroy') {
			throw new McpError(
				ErrorCode.InvalidParams,
				`Unknown tool: ${request.params.name}`
			);
		}

		const args = request.params.arguments || {};

		// Validate input with TypeBox
		if (action.input) {
			if (!Value.Check(action.input, args)) {
				const errors = [...Value.Errors(action.input, args)];
				throw new McpError(
					ErrorCode.InvalidParams,
					`Invalid input for ${request.params.name}: ${JSON.stringify(errors.map(e => ({
						path: e.path,
						message: e.message
					})))}`
				);
			}
		}

		// Execute action (already bound to client)
		const result = action.input ? await action(args) : await action();

		// Validate output schema if present
		if (action.output) {
			// Check if result follows Result<T, E> pattern with data
			if (result.data !== undefined) {
				if (!Value.Check(action.output, result.data)) {
					const errors = [...Value.Errors(action.output, result.data)];
					throw new McpError(
						ErrorCode.InternalError,
						`Output validation failed for ${request.params.name}: ${JSON.stringify(errors.map(e => ({
							path: e.path,
							message: e.message
						})))}`
					);
				}
			}
		}

		// Handle Result<T, E> format
		if (result.error) {
			return {
				content: [{
					type: 'text' as const,
					text: JSON.stringify({ error: result.error.message || 'Unknown error' }),
				}],
				isError: true,
			};
		}

		return {
			content: [{
				type: 'text' as const,
				text: JSON.stringify(result.data),
			}],
			structuredContent: result.data,
		};
	});

	// Register MCP endpoint using StreamableHTTPTransport
	app.all('/mcp', async (c) => {
		const transport = new StreamableHTTPTransport();
		await mcpServer.connect(transport);
		return transport.handleRequest(c);
	});

	return app;
}
