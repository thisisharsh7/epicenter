import { StreamableHTTPTransport } from '@hono/mcp';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Hono } from 'hono';
import { Value } from 'typebox/value';
import type { EpicenterConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import { executeAction } from './utils';
import type { Action } from '../core/actions';

/**
 * Create a Hono server from an Epicenter configuration
 * Exposes all workspace actions as REST endpoints and MCP tools
 *
 * @param config - Epicenter configuration with workspaces
 * @returns Hono app instance
 *
 * @example
 * ```typescript
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [blogWorkspace, authWorkspace],
 * });
 *
 * const app = createEpicenterServer(epicenter);
 *
 * Bun.serve({
 *   fetch: app.fetch,
 *   port: 3000,
 * });
 *
 * // Routes:
 * // GET  /blog/getAllPosts
 * // POST /blog/createPost
 * // POST /mcp/tools/list
 * // POST /mcp/tools/call
 * ```
 */
export async function createEpicenterServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): Promise<Hono> {
	const app = new Hono();

	// Initialize epicenter client
	const client = await createEpicenterClient(config);

	// Collect all actions from all workspaces for MCP
	const allActions: Map<string, Action> = new Map();

	// Register routes for each workspace
	for (const workspace of config.workspaces) {
		const workspaceClient = client[workspace.name as keyof typeof client];

		// Get all handler names from the client (these are the action names)
		const handlerNames = Object.keys(workspaceClient as any).filter(
			(key) => typeof workspaceClient[key] === 'function' && key !== 'destroy',
		);

		for (const actionName of handlerNames) {
			const action = workspaceClient[actionName];
			const getPath = `/${workspace.name}/${actionName}`;
			const postPath = `/${workspace.name}/${actionName}`;

			// Store for MCP with workspace prefix
			const mcpToolName = `${workspace.name}_${actionName}`;
			allActions.set(mcpToolName, action);

			// Register as both GET and POST
			app.get(getPath, async (c) => {
				const query = c.req.query();
				const input = Object.keys(query).length > 0 ? query : undefined;
				return executeAction(c, action, input);
			});

			app.post(postPath, async (c) => {
				const body = await c.req.json().catch(() => ({}));
				const input = Object.keys(body).length > 0 ? body : undefined;
				return executeAction(c, action, input);
			});
		}
	}

	// Create MCP server for /mcp endpoint
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
		},
	);

	// List tools - iterate over all workspace actions
	mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: Array.from(allActions.entries()).map(([name, action]) => ({
			name,
			title: name,
			description: (action as any).description,
			inputSchema: (action as any).input || {
				type: 'object' as const,
				properties: {},
			},
		})),
	}));

	// Call tool - validate with TypeBox, execute action
	mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
		const action = allActions.get(request.params.name);

		// Check if action exists and is valid
		if (!action || typeof action !== 'function') {
			throw new McpError(
				ErrorCode.InvalidParams,
				`Unknown tool: ${request.params.name}`,
			);
		}

		const args = request.params.arguments || {};

		// Validate input with TypeBox
		if (action.input) {
			if (!Value.Check(action.input, args)) {
				const errors = [...Value.Errors(action.input, args)];
				throw new McpError(
					ErrorCode.InvalidParams,
					`Invalid input for ${request.params.name}: ${JSON.stringify(
						errors.map((e) => ({
							path: e.path,
							message: e.message,
						})),
					)}`,
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
						`Output validation failed for ${request.params.name}: ${JSON.stringify(
							errors.map((e) => ({
								path: e.path,
								message: e.message,
							})),
						)}`,
					);
				}
			}
		}

		// Handle Result<T, E> format
		if (result.error) {
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify({
							error: result.error.message || 'Unknown error',
						}),
					},
				],
				isError: true,
			};
		}

		return {
			content: [
				{
					type: 'text' as const,
					text: JSON.stringify(result.data),
				},
			],
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
