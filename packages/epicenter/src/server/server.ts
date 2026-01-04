import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import { Err, isResult, Ok } from 'wellcrafted/result';
import { type Action, type Actions, isAction } from '../core/actions';
import type { BoundWorkspaceClient } from '../core/workspace/contract';
import { createSyncPlugin } from './sync';
import { createTablesPlugin } from './tables';

export const DEFAULT_PORT = 3913;

export type ServerOptions = {
	port?: number;
};

type AnyWorkspaceClient = BoundWorkspaceClient<string, any, any, any, Actions>;

type ActionInfo = {
	workspaceId: string;
	actionPath: string[];
	action: Action;
	handler: (input: unknown) => Promise<unknown>;
};

function extractActions(
	actions: Actions,
	workspaceId: string,
	path: string[] = [],
): ActionInfo[] {
	const result: ActionInfo[] = [];

	for (const [key, actionOrNamespace] of Object.entries(actions)) {
		const actionPath = [...path, key];

		if (isAction(actionOrNamespace)) {
			result.push({
				workspaceId,
				actionPath,
				action: actionOrNamespace,
				handler: actionOrNamespace as (input: unknown) => Promise<unknown>,
			});
		} else {
			result.push(
				...extractActions(
					actionOrNamespace as Actions,
					workspaceId,
					actionPath,
				),
			);
		}
	}

	return result;
}

/**
 * Create an HTTP server that exposes workspace clients as REST APIs, OpenAPI docs,
 * and WebSocket sync endpoints.
 *
 * The server provides the following URL hierarchy:
 * - `/` - API root with discovery info (name, version, available workspaces)
 * - `/openapi` - Interactive API documentation (Scalar UI)
 * - `/openapi/json` - OpenAPI specification in JSON format
 * - `/workspaces/{id}/actions/{action}` - Workspace action endpoints (GET for queries, POST for mutations)
 * - `/workspaces/{id}/tables/{table}` - RESTful table CRUD endpoints
 * - `/workspaces/{id}/sync` - WebSocket sync endpoint (y-websocket protocol)
 *
 * @param clientOrClients - A single workspace client or array of clients to expose
 * @param options - Server configuration options
 * @param options.port - Port to listen on (default: 3913, or PORT env var)
 *
 * @example
 * ```typescript
 * // Single workspace
 * const blogClient = await createClient(blogWorkspace);
 * const server = createServer(blogClient, { port: 3913 });
 * server.start();
 *
 * // Multiple workspaces
 * const blogClient = await createClient(blogWorkspace);
 * const authClient = await createClient(authWorkspace);
 * const server = createServer([blogClient, authClient]);
 * server.start();
 *
 * // Access endpoints:
 * // GET  http://localhost:3913/workspaces/blog/actions/getAllPosts
 * // POST http://localhost:3913/workspaces/blog/actions/createPost
 * // GET  http://localhost:3913/workspaces/auth/actions/getCurrentUser
 * ```
 */
function createServer(
	client: AnyWorkspaceClient,
	options?: ServerOptions,
): ReturnType<typeof createServerInternal>;
function createServer(
	clients: AnyWorkspaceClient[],
	options?: ServerOptions,
): ReturnType<typeof createServerInternal>;
function createServer(
	clientOrClients: AnyWorkspaceClient | AnyWorkspaceClient[],
	options?: ServerOptions,
): ReturnType<typeof createServerInternal> {
	const clients = Array.isArray(clientOrClients)
		? clientOrClients
		: [clientOrClients];
	return createServerInternal(clients, options);
}

function createServerInternal(
	clients: AnyWorkspaceClient[],
	options?: ServerOptions,
) {
	const workspaces: Record<string, AnyWorkspaceClient> = {};
	const allActions: ActionInfo[] = [];

	for (const client of clients) {
		const workspaceId = client.id;
		workspaces[workspaceId] = client;

		allActions.push(...extractActions(client.actions, workspaceId));
	}

	const app = new Elysia()
		.use(
			openapi({
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
		.use(
			createSyncPlugin({
				getDoc: (room) => workspaces[room]?.ydoc,
			}),
		)
		.use(createTablesPlugin(workspaces as Record<string, AnyWorkspaceClient>))
		.get('/', () => ({
			name: 'Epicenter API',
			version: '1.0.0',
			docs: '/openapi',
			workspaces: Object.keys(workspaces),
		}));

	for (const { workspaceId, actionPath, action, handler } of allActions) {
		const path = `/workspaces/${workspaceId}/actions/${actionPath.join('/')}`;
		const operationType = (
			{ query: 'queries', mutation: 'mutations' } as const
		)[action.type];
		const tags = [workspaceId, operationType];

		switch (action.type) {
			case 'query':
				app.get(
					path,
					async ({ query, status }) => {
						const result = await handler(action.input ? query : undefined);
						if (isResult(result)) {
							const { data, error } = result;
							if (error) return status('Internal Server Error', Err(error));
							return Ok(data);
						}
						return result;
					},
					{
						...(action.input ? { query: action.input } : {}),
						detail: { description: action.description, tags },
					},
				);
				break;
			case 'mutation':
				app.post(
					path,
					async ({ body, status }) => {
						const result = await handler(action.input ? body : undefined);
						if (isResult(result)) {
							const { data, error } = result;
							if (error) return status('Internal Server Error', Err(error));
							return Ok(data);
						}
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

	const port =
		options?.port ??
		Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

	return {
		app,

		start() {
			console.log('🔨 Creating HTTP server...');

			const server = Bun.serve({
				fetch: app.fetch,
				port,
			});

			console.log('\n🚀 Epicenter HTTP Server Running!\n');
			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
			console.log(`📍 Server: http://localhost:${port}`);
			console.log(`📖 API Docs: http://localhost:${port}/openapi`);
			console.log(`📄 OpenAPI Spec: http://localhost:${port}/openapi/json\n`);

			console.log('📦 Available Workspaces:\n');
			const actionsByWorkspace = Object.groupBy(
				allActions,
				(info) => info.workspaceId,
			);

			for (const [workspaceId, actions] of Object.entries(actionsByWorkspace)) {
				console.log(`  • ${workspaceId}`);
				for (const { actionPath, action } of actions ?? []) {
					const method = action.type === 'query' ? 'GET' : 'POST';
					const actionName = actionPath.join('/');
					console.log(`    └─ [${method}] ${actionName}`);
				}
				console.log();
			}

			console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
			console.log('Server is running. Press Ctrl+C to stop.\n');

			let isShuttingDown = false;

			const shutdown = async (signal: string) => {
				if (isShuttingDown) return;
				isShuttingDown = true;

				console.log(`\n🛑 Received ${signal}, shutting down...`);

				server.stop();
				await Promise.all(clients.map((c) => c.destroy()));

				console.log('✅ Server stopped cleanly\n');
				process.exit(0);
			};

			process.on('SIGINT', () => shutdown('SIGINT'));
			process.on('SIGTERM', () => shutdown('SIGTERM'));

			return server;
		},

		async destroy() {
			await Promise.all(clients.map((c) => c.destroy()));
		},
	};
}

export { createServer };
