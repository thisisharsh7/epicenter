import { Hono } from 'hono';
import type { WorkspaceActionMap } from '../core/actions';
import type { WorkspaceIndexMap } from '../core/indexes';
import type { WorkspaceSchema } from '../core/schema';
import type { ImmediateDependencyWorkspaceConfig, WorkspaceConfig } from '../core/workspace';
import { createWorkspaceClient } from '../core/workspace';
import { createMCPTools, handleMCPToolCall, handleMCPToolsList, type MCPToolCallRequest } from './mcp';
import { executeAction } from './utils';

/**
 * Create a Hono server from a Workspace configuration
 * Exposes all workspace actions as REST endpoints and MCP tools
 *
 * @param config - Workspace configuration
 * @returns Hono app instance
 *
 * @example
 * ```typescript
 * const app = createWorkspaceServer(blogWorkspace);
 *
 * Bun.serve({
 *   fetch: app.fetch,
 *   port: 3001,
 * });
 *
 * // Routes:
 * // GET  /getAllPosts
 * // POST /createPost
 * // POST /mcp/tools/list
 * // POST /mcp/tools/call
 * ```
 */
export async function createWorkspaceServer<
	TDeps extends readonly ImmediateDependencyWorkspaceConfig[],
	TId extends string,
	TVersion extends number,
	TName extends string,
	TWorkspaceSchema extends WorkspaceSchema,
	TIndexes extends WorkspaceIndexMap<TWorkspaceSchema>,
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

	// Initialize workspace client
	const client = createWorkspaceClient(config);

	// Collect all actions for MCP
	const allActions: Record<
		string,
		{ handler: Function }
	> = {};

	// Get all handler names from the client (these are the action names)
	const handlerNames = Object.keys(client).filter(
		(key) => typeof (client as any)[key] === 'function' && key !== 'destroy'
	);

	// Register each action as a route
	for (const actionName of handlerNames) {
		const handler = (client as any)[actionName];
		const path = `/${actionName}`;

		// Store for MCP
		allActions[actionName] = { handler };

		// Register as both GET and POST
		// The actual request method used will depend on the client
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
