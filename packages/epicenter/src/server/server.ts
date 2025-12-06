import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import { mcp } from 'elysia-mcp';
import { Err, isResult, Ok } from 'wellcrafted/result';
import {
	createEpicenterClient,
	type EpicenterConfig,
	iterActions,
} from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import { buildMcpToolRegistry, setupMcpTools } from './mcp';

/**
 * Create a unified server with REST, MCP, and API documentation endpoints
 *
 * This creates an Elysia server that exposes workspace actions through multiple interfaces:
 * - REST endpoints: GET `/{workspace}/{action}` for queries, POST for mutations
 * - MCP endpoint: POST `/mcp` for Model Context Protocol clients (using Server-Sent Events)
 * - API documentation: `/openapi` (Scalar UI by default)
 *
 * The function initializes the Epicenter client, registers REST routes for all workspace actions,
 * and configures an MCP server instance for protocol-based access.
 *
 * @param config - Epicenter configuration with workspaces
 * @returns Object containing the Elysia app and Epicenter client
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
 * app.listen(3913);
 *
 * // Access at:
 * // - http://localhost:3913/openapi (Scalar UI)
 * // - http://localhost:3913/openapi/json (OpenAPI spec)
 * // - http://localhost:3913/mcp (MCP endpoint)
 * ```
 */
export async function createServer<
	TId extends string,
	TWorkspaces extends readonly AnyWorkspaceConfig[],
>(config: EpicenterConfig<TId, TWorkspaces>) {
	// Create client
	const client = await createEpicenterClient(config);

	// Build tool registry for MCP (needed for setupServer callback)
	const toolRegistry = await buildMcpToolRegistry(client);

	// Create Elysia app with plugins
	const app = new Elysia()
		// OpenAPI documentation (Scalar UI by default)
		.use(
			openapi({
				// Embed spec directly in HTML to avoid fetch issues
				embedSpec: true,
				documentation: {
					info: {
						title: `${config.id} API`,
						version: '1.0.0',
						description: 'API documentation for Epicenter workspaces',
					},
				},
			}),
		)
		// Root route for health check / discovery
		.get('/', () => ({
			name: `${config.id} API`,
			version: '1.0.0',
			docs: '/openapi',
		}))
		// MCP endpoint (commented out for now)
		.use(
			mcp({
				basePath: '/mcp',
				serverInfo: {
					name: config.id,
					version: '1.0.0',
				},
				capabilities: {
					tools: {},
				},
				setupServer: (server) => {
					setupMcpTools(server, toolRegistry);
				},
			}),
		);

	// Register REST endpoints for each workspace action
	// Supports nested exports: actionPath like ['users', 'crud', 'create']
	// becomes route path '/workspace/users/crud/create'
	for (const { workspaceId, actionPath, action } of iterActions(client)) {
		const path = `/${workspaceId}/${actionPath.join('/')}`;

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
					async ({ query, status }) => {
						// Execute action with validated input
						const result = await action(action.input ? query : undefined);

						// Handle both Result types and raw values
						if (isResult(result)) {
							const { data, error } = result;
							if (error) return status('Internal Server Error', Err(error));
							return Ok(data);
						}

						// Raw value from handler that can't fail
						return result;
					},
					{
						...(action.input ? { query: action.input } : {}),
						detail: {
							description: action.description,
							tags,
						},
					},
				);
				break;
			case 'mutation':
				// Mutations use POST with JSON body
				app.post(
					path,
					async ({ body, status }) => {
						// Execute action with validated input
						const result = await action(action.input ? body : undefined);

						// Handle both Result types and raw values
						if (isResult(result)) {
							const { data, error } = result;
							if (error) return status('Internal Server Error', Err(error));
							return Ok(data);
						}

						// Raw value from handler that can't fail
						return result;
					},
					{
						...(action.input ? { body: action.input } : {}),
						detail: {
							description: action.description,
							tags,
						},
					},
				);
				break;
		}
	}

	return {
		/** Elysia web server instance */
		app,
		/** Epicenter client with initialized workspaces and actions */
		client,
	};
}
