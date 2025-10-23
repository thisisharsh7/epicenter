import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { Err, Ok } from 'wellcrafted/result';
import { createEpicenterClient, forEachAction, type EpicenterClient, type EpicenterConfig } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import { createMcpServer } from './mcp';

/**
 * Create a unified server with REST and MCP endpoints
 *
 * This creates a Hono server that exposes workspace actions through multiple interfaces:
 * - REST endpoints: GET/POST `/{workspace}/{action}` for direct HTTP access
 * - MCP endpoint: POST `/mcp` for Model Context Protocol clients (using Server-Sent Events)
 *
 * The function initializes the Epicenter client, registers REST routes for all workspace actions,
 * and configures an MCP server instance for protocol-based access.
 *
 * @param config - Epicenter configuration with workspaces
 * @returns Object containing the Hono app and initialized Epicenter client
 *
 * @see {@link createMcpServer} in mcp.ts for the MCP server implementation
 *
 * @example
 * ```typescript
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [blogWorkspace],
 * });
 *
 * const { app, client } = await createServer(epicenter);
 *
 * // Use app for serving
 * Bun.serve({
 *   fetch: app.fetch,
 *   port: 3913,
 * });
 * ```
 */
export async function createServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): Promise<{
	/** Hono web server instance ready to serve with `Bun.serve({ fetch: app.fetch })` */
	app: Hono;
	/** Epicenter client with initialized workspaces and actions */
	client: EpicenterClient<TWorkspaces>;
}> {
	const app = new Hono();

	// Create client
	const client = await createEpicenterClient(config);

	// Register REST endpoints for each workspace action
	forEachAction(client, ({ workspaceName, actionName, action }) => {
		const path = `/${workspaceName}/${actionName}`;

		// Register as both GET and POST
		app.get(path, async (c) => {
			const query = c.req.query();
			const input = Object.keys(query).length > 0 ? query : undefined;
			const { data, error } = await action(input);
			if (error) return c.json(Err(error), 500);
			return c.json(Ok(data));
		});

		app.post(path, async (c) => {
			const body = await c.req.json().catch(() => ({}));
			const input = Object.keys(body).length > 0 ? body : undefined;
			const { data, error } = await action(input);
			if (error) return c.json(Err(error), 500);
			return c.json(Ok(data));
		});
	});

	// Create and configure MCP server for /mcp endpoint
	const mcpServer = createMcpServer(client, config);

	// Register MCP endpoint using StreamableHTTPTransport
	app.all('/mcp', async (c) => {
		const transport = new StreamableHTTPTransport();
		await mcpServer.connect(transport);
		return transport.handleRequest(c);
	});

	return { app, client };
}
