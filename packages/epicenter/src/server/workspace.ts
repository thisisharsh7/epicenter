import { Hono } from 'hono';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
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
 * Exposes all workspace actions as REST endpoints
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
 * // Routes:
 * // GET  /getAllPosts
 * // POST /createPost
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
	const client = createWorkspaceClient(config);

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

	return app;
}

/**
 * Create an MCP stdio server from a Workspace configuration
 * Exposes all workspace actions as MCP tools for Claude Desktop
 *
 * @param config - Workspace configuration
 * @returns Promise that resolves when server is connected
 *
 * @example
 * ```typescript
 * // In your MCP server entry point:
 * await createWorkspaceMCPServer(blogWorkspace);
 * ```
 */
export async function createWorkspaceMCPServer<
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
): Promise<void> {
	// Initialize workspace client (already has all actions with metadata)
	const client = await createWorkspaceClient(config);

	// Create MCP server
	const server = new McpServer(
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
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const action = (client as any)[request.params.name];

		// Check if action exists and is valid
		if (!action || typeof action !== 'function' || request.params.name === 'destroy') {
			throw new Error(`Unknown tool: ${request.params.name}`);
		}

		const args = request.params.arguments || {};

		// Validate input with TypeBox
		if (action.input) {
			if (!Value.Check(action.input, args)) {
				const errors = [...Value.Errors(action.input, args)];
				throw new Error(`Invalid input: ${JSON.stringify(errors.map(e => ({
					path: e.path,
					message: e.message
				})))}`);
			}
		}

		// Execute action (already bound to client)
		const result = action.input ? await action(args) : await action();

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

	// Connect to stdio
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
