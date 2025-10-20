import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import type { EpicenterConfig } from '../core/epicenter';
import { createEpicenterClient } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import { createMcpServer } from './mcp-handlers';
import { executeAction } from './utils';

/**
 * Create an HTTP server with REST and MCP endpoints
 *
 * This creates a Hono server that exposes:
 * - REST endpoints: GET/POST /{workspace}/{action}
 * - MCP endpoint: POST /mcp (using Server-Sent Events)
 *
 * @param config - Epicenter configuration with workspaces
 * @returns Hono app instance
 *
 * @example
 * ```typescript
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [blogWorkspace],
 * });
 *
 * const app = await createHttpServer(epicenter);
 *
 * Bun.serve({
 *   fetch: app.fetch,
 *   port: 3000,
 * });
 * ```
 */
export async function createHttpServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>): Promise<Hono> {
	const app = new Hono();

	// Create client
	const client = await createEpicenterClient(config);

	// Register REST endpoints for each workspace action
	for (const workspace of config.workspaces) {
		const workspaceClient = client[workspace.name as keyof typeof client];

		const handlerNames = Object.keys(workspaceClient as any).filter(
			(key) => typeof workspaceClient[key] === 'function' && key !== 'destroy'
		);

		for (const actionName of handlerNames) {
			const action = workspaceClient[actionName];
			const path = `/${workspace.name}/${actionName}`;

			// Register as both GET and POST
			app.get(path, async (c) => {
				const query = c.req.query();
				const input = Object.keys(query).length > 0 ? query : undefined;
				return executeAction(c, action, input);
			});

			app.post(path, async (c) => {
				const body = await c.req.json().catch(() => ({}));
				const input = Object.keys(body).length > 0 ? body : undefined;
				return executeAction(c, action, input);
			});
		}
	}

	// Create and configure MCP server for /mcp endpoint
	const mcpServer = createMcpServer(client, config);

	// Register MCP endpoint using StreamableHTTPTransport
	app.all('/mcp', async (c) => {
		const transport = new StreamableHTTPTransport();
		await mcpServer.connect(transport);
		return transport.handleRequest(c);
	});

	return app;
}
