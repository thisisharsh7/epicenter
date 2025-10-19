import { Hono } from 'hono';
import { sValidator } from '@hono/standard-validator';
import type { EpicenterConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import type { Action } from '../core/actions';
import { executeAction } from './utils';
import { createMCPTools, handleMCPToolsList, handleMCPToolCall, type MCPToolCallRequest } from './mcp';

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
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<Hono> {
	const app = new Hono();

	// Initialize epicenter client
	const client = await createEpicenterClient(config);

	// Collect all actions from all workspaces for MCP
	const allActions: Record<
		string,
		{ handler: Function }
	> = {};

	// Register routes for each workspace
	// For each workspace, we need to inspect the config to get the action metadata
	for (const workspace of config.workspaces) {
		const workspaceClient = client[workspace.name as keyof typeof client] as any;

		// Get all handler names from the client (these are the action names)
		const handlerNames = Object.keys(workspaceClient).filter(
			(key) => typeof workspaceClient[key] === 'function' && key !== 'destroy'
		);

		// For each handler, we need to determine if it's a query or mutation
		// Since we can't easily access this without calling actions(), we'll use a convention:
		// We'll try both GET and POST for each action and let validation handle it
		// This is a simpler approach that doesn't require action metadata

		for (const actionName of handlerNames) {
			const handler = workspaceClient[actionName];
			const getPath = `/${workspace.name}/${actionName}`;
			const postPath = `/${workspace.name}/${actionName}`;

			// Store for MCP
			const mcpToolName = `${workspace.name}_${actionName}`;
			allActions[mcpToolName] = { handler };

			// Register as both GET and POST
			// The actual request method used will depend on the client
			app.get(getPath, async (c) => {
				const query = c.req.query();
				const input = Object.keys(query).length > 0 ? query : undefined;
				return executeAction(c, handler, input);
			});

			app.post(postPath, async (c) => {
				const body = await c.req.json().catch(() => ({}));
				const input = Object.keys(body).length > 0 ? body : undefined;
				return executeAction(c, handler, input);
			});
		}
	}

	// Register MCP endpoints
	const mcpTools = createMCPTools(allActions);

	app.post('/mcp/tools/list', (c) => {
		return c.json(handleMCPToolsList(mcpTools));
	});

	app.post('/mcp/tools/call', async (c) => {
		const request = await c.req.json<MCPToolCallRequest>();
		const response = await handleMCPToolCall(c, request, allActions);
		return c.json(response);
	});

	return app;
}
