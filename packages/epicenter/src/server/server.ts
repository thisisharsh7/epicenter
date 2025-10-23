import { StreamableHTTPTransport } from '@hono/mcp';
import { swaggerUI } from '@hono/swagger-ui';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { describeRoute, openAPIRouteHandler, validator } from 'hono-openapi';
import { Err, Ok } from 'wellcrafted/result';
import { createEpicenterClient, forEachAction, type EpicenterClient, type EpicenterConfig } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import { createMcpServer } from './mcp';

/**
 * Create a unified server with REST, MCP, and API documentation endpoints
 *
 * This creates a Hono server that exposes workspace actions through multiple interfaces:
 * - REST endpoints: GET/POST `/{workspace}/{action}` for direct HTTP access
 * - MCP endpoint: POST `/mcp` for Model Context Protocol clients (using Server-Sent Events)
 * - API documentation: `/swagger-ui` (Swagger UI) and `/scalar` (Scalar)
 * - OpenAPI spec: `/openapi.json`
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
 *
 * // Access documentation at:
 * // - http://localhost:3913/swagger-ui (Swagger UI)
 * // - http://localhost:3913/scalar (Scalar)
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

		// Tag with both workspace and operation type for multi-dimensional grouping
		const operationType = ({ query: 'queries', mutation: 'mutations' } as const)[action.type];
		const tags = [workspaceName, operationType];

		// Register GET endpoint
		app.get(
			path,
			describeRoute({
				description: action.description,
				tags,
			}),
			...(action.input ? [validator('query', action.input)] : []),
			async (c) => {
				const query = c.req.query();
				const input = Object.keys(query).length > 0 ? query : undefined;
				const { data, error } = await action(input);
				if (error) return c.json(Err(error), 500);
				return c.json(Ok(data));
			},
		);

		// Register POST endpoint
		app.post(
			path,
			describeRoute({
				description: action.description,
				tags,
			}),
			...(action.input ? [validator('json', action.input)] : []),
			async (c) => {
				const body = await c.req.json().catch(() => ({}));
				const input = Object.keys(body).length > 0 ? body : undefined;
				const { data, error } = await action(input);
				if (error) return c.json(Err(error), 500);
				return c.json(Ok(data));
			},
		);
	});

	// Create and configure MCP server for /mcp endpoint
	const mcpServer = createMcpServer(client, config);

	// Register MCP endpoint using StreamableHTTPTransport
	app.all('/mcp', async (c) => {
		const transport = new StreamableHTTPTransport();
		await mcpServer.connect(transport);
		return transport.handleRequest(c);
	});

	// OpenAPI specification endpoint
	app.get(
		'/openapi.json',
		openAPIRouteHandler(app, {
			documentation: {
				info: {
					title: `${config.id} API`,
					version: '1.0.0',
					description: 'API documentation for Epicenter workspaces',
				},
			},
		}),
	);

	// Swagger UI endpoint
	app.get('/swagger-ui', swaggerUI({ url: '/openapi.json' }));

	// Scalar UI endpoint
	app.get('/scalar', Scalar({ url: '/openapi.json' }));

	return { app, client };
}
