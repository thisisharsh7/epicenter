import { StreamableHTTPTransport } from '@hono/mcp';
import { swaggerUI } from '@hono/swagger-ui';
import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { describeRoute, openAPIRouteHandler, validator } from 'hono-openapi';
import type { TaggedError } from 'wellcrafted/error';
import { Err, Ok, type Result, isResult } from 'wellcrafted/result';
import {
	type EpicenterClient,
	type EpicenterConfig,
	createEpicenterClient,
	forEachAction,
} from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import { createMcpServer } from './mcp';

/**
 * Create a unified server with REST, MCP, and API documentation endpoints
 *
 * This creates a Hono server that exposes workspace actions through multiple interfaces:
 * - REST endpoints: GET `/{workspace}/{action}` for queries, POST for mutations
 * - MCP endpoint: POST `/mcp` for Model Context Protocol clients (using Server-Sent Events)
 * - API documentation: `/swagger-ui` (Swagger UI) and `/scalar` (Scalar)
 * - OpenAPI spec: `/openapi.json`
 *
 * The function initializes the Epicenter client, registers REST routes for all workspace actions,
 * and configures an MCP server instance for protocol-based access.
 *
 * @param config - Epicenter configuration with workspaces
 * @returns Object containing the Hono app and Epicenter client
 *
 * @see {@link createMcpServer} in mcp.ts for the MCP server implementation
 *
 * @example
 * ```typescript
 * import { defineEpicenter } from '@epicenter/core';
 * import { createServer } from '@epicenter/core/server';
 * import { blogWorkspace } from './workspaces/blog';
 *
 * const epicenter = defineEpicenter({
 *   id: 'my-app',
 *   workspaces: [blogWorkspace],
 * });
 *
 * const { app, client } = await createServer(epicenter);
 *
 * Bun.serve({
 *   fetch: app.fetch,
 *   port: 3913,
 * });
 *
 * // Access at:
 * // - http://localhost:3913/swagger-ui (Swagger UI)
 * // - http://localhost:3913/scalar (Scalar)
 * ```
 */
export async function createServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(
	config: EpicenterConfig<TId, TWorkspaces>,
): Promise<{
	/** Hono web server instance */
	app: Hono;
	/** Epicenter client with initialized workspaces and actions */
	client: EpicenterClient<TWorkspaces>;
}> {
	const app = new Hono();

	// Create client
	const client = await createEpicenterClient(config);

	// Register REST endpoints for each workspace action
	forEachAction(client, ({ workspaceId, actionName, action }) => {
		const path = `/${workspaceId}/${actionName}`;

		// Tag with both workspace and operation type for multi-dimensional grouping
		const operationType = (
			{ query: 'queries', mutation: 'mutations' } as const
		)[action.type];
		const tags = [workspaceId, operationType];

		switch (action.type) {
			case 'query':
				// Queries use GET with query parameters
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

						// Execute action with validation for external HTTP input
						// Actions always return Result now
						const { data, error } = action.input
							? await action.withValidation(input)
							: await action(input);

						// Actions always return Result, so we can access data/error directly
						if (error) return c.json(Err(error), 500);
						return c.json(Ok(data));
					},
				);
				break;
			case 'mutation':
				// Mutations use POST with JSON body
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

						// Execute action with validation for external HTTP input
						// Actions always return Result now
						const { data, error } = action.input
							? await action.withValidation(input)
							: await action(input);

						// Actions always return Result, so we can access data/error directly
						if (error) return c.json(Err(error), 500);
						return c.json(Ok(data));
					},
				);
				break;
		}
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
			excludeStaticFile: false,
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
