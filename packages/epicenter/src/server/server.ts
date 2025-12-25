import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import { Err, isResult, Ok } from 'wellcrafted/result';
import type { WorkspaceExports } from '../core/actions';
import type {
	AnyWorkspaceConfig,
	WorkspaceClient,
	WorkspacesToClients,
} from '../core/workspace';
import { iterActions } from '../core/workspace';
import {
	type CreateClientOptions,
	createClient,
} from '../core/workspace/client.node';
import { createSyncPlugin } from './sync';

/**
 * Create a unified server with REST, WebSocket sync, and API documentation endpoints.
 *
 * This creates an Elysia server that exposes workspace actions through multiple interfaces:
 * - REST endpoints: GET `/workspaces/{workspace}/{action}` for queries, POST for mutations
 * - WebSocket sync: `/sync/{workspaceId}` for real-time Y.Doc synchronization
 * - API documentation: `/openapi` (Scalar UI by default)
 *
 * URL Hierarchy:
 * - `/` - API root/discovery
 * - `/openapi` - OpenAPI spec (JSON)
 * - `/scalar` - Scalar UI documentation
 * - `/sync/{workspaceId}` - WebSocket sync endpoint (y-websocket protocol)
 * - `/workspaces/{workspaceId}/{action}` - Workspace actions
 *
 * @param workspaces - Array of workspace configurations
 * @param options - Optional client options (e.g., storageDir)
 * @returns Object containing the Elysia app and initialized client
 *
 * @example
 * ```typescript
 * import { createServer } from '@epicenter/hq';
 * import { blogWorkspace } from './workspaces/blog';
 *
 * const { app, client } = await createServer([blogWorkspace]);
 *
 * app.listen(3913);
 *
 * // Access at:
 * // - http://localhost:3913/openapi (Scalar UI)
 * // - http://localhost:3913/workspaces/blog/createPost (REST)
 * // - ws://localhost:3913/sync/blog (WebSocket sync)
 * ```
 */
export async function createServer<
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(workspaces: TWorkspaces, options?: CreateClientOptions) {
	const client = await createClient(workspaces, options);

	const app = new Elysia()
		.use(
			openapi({
				// Embed spec directly in HTML to avoid fetch issues
				embedSpec: true,
				documentation: {
					info: {
						title: 'Epicenter API',
						version: '1.0.0',
						description: 'API documentation for Epicenter workspaces',
					},
				},
			}),
		)
		// TODO: MCP endpoint at /mcp (commented out pending custom implementation)
		// .use(
		// 	mcp({
		// 		basePath: '/mcp',
		// 		serverInfo: {
		// 			name: config.id,
		// 			version: '1.0.0',
		// 		},
		// 		capabilities: {
		// 			tools: {},
		// 		},
		// 		setupServer: (server) => {
		// 			setupMcpTools(server, toolRegistry);
		// 		},
		// 	}),
		// )
		// WebSocket sync endpoint at /sync/{workspaceId}
		.use(
			createSyncPlugin({
				getDoc: (room) => {
					// Room name is the workspace ID
					// Type assertion needed because TypeScript can't prove the generic
					// WorkspacesToClients mapping resolves to WorkspaceClient
					const workspace = client[
						room as keyof WorkspacesToClients<TWorkspaces>
					] as WorkspaceClient<WorkspaceExports> | undefined;
					return workspace?.$ydoc;
				},
			}),
		)
		// Health check / discovery
		.get('/', () => ({
			name: 'Epicenter API',
			version: '1.0.0',
			docs: '/openapi',
		}));

	// Register REST endpoints for each workspace action
	// Supports nested exports: actionPath like ['users', 'crud', 'create']
	// becomes route path '/workspaces/workspace/users/crud/create'
	for (const { workspaceId, actionPath, action } of iterActions(client)) {
		const path = `/workspaces/${workspaceId}/${actionPath.join('/')}`;

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
						detail: { description: action.description, tags },
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
						detail: { description: action.description, tags },
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
