import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import { Err, isResult, Ok } from 'wellcrafted/result';
import type { Actions } from '../core/actions';
import type {
	AnyWorkspaceConfig,
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from '../core/workspace';
import { createSyncPlugin } from './sync';
import { createTablesPlugin } from './tables';

export const DEFAULT_PORT = 3913;

export type StartServerOptions = {
	port?: number;
};

/**
 * Create a server from an initialized Epicenter client.
 *
 * This creates an Elysia server that exposes workspace actions through multiple interfaces:
 * - REST endpoints: GET/POST `/workspaces/{workspace}/actions/{action}`
 * - RESTful tables: CRUD at `/workspaces/{workspace}/tables/{table}`
 * - WebSocket sync: `/workspaces/{workspaceId}/sync` for real-time Y.Doc synchronization
 * - API documentation: `/openapi` (Scalar UI)
 *
 * URL Hierarchy:
 * - `/` - API root/discovery
 * - `/openapi` - Scalar UI documentation
 * - `/openapi/json` - OpenAPI spec (JSON)
 * - `/workspaces/{workspaceId}/sync` - WebSocket sync endpoint (y-websocket protocol)
 * - `/workspaces/{workspaceId}/actions/{action}` - Workspace actions (queries: GET, mutations: POST)
 * - `/workspaces/{workspaceId}/tables/{table}` - RESTful table CRUD
 *
 * @param client - Initialized Epicenter client from createClient()
 * @returns Object with Elysia app and start method
 *
 * @example
 * ```typescript
 * import { createClient, createServer } from '@epicenter/hq';
 * import { blogWorkspace } from './workspaces/blog';
 *
 * const client = await createClient([blogWorkspace]);
 * const server = createServer(client);
 *
 * server.start({ port: 3913 });
 *
 * // Access at:
 * // - http://localhost:3913/openapi (Scalar UI)
 * // - http://localhost:3913/workspaces/blog/actions/createPost (REST)
 * // - ws://localhost:3913/workspaces/blog/sync (WebSocket sync)
 * ```
 */
export function createServer<
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(client: EpicenterClient<TWorkspaces>) {
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
				getDoc: (room) => {
					const workspace = client[
						room as keyof WorkspacesToClients<TWorkspaces>
					] as WorkspaceClient<Actions> | undefined;
					return workspace?.$ydoc;
				},
			}),
		)
		.use(
			createTablesPlugin(
				client.$workspaces as Record<string, WorkspaceClient<Actions>>,
			),
		)
		.get('/', () => ({
			name: 'Epicenter API',
			version: '1.0.0',
			docs: '/openapi',
		}));

	for (const { workspaceId, actionPath, action } of client.$actions) {
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
						const result = await action(action.input ? query : undefined);
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
						const result = await action(action.input ? body : undefined);
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

	return {
		app,

		start(options: StartServerOptions = {}) {
			const port =
				options.port ??
				Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

			console.log('🔨 Creating HTTP server for epicenter...');

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
				client.$actions,
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

				console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

				server.stop();
				await client.destroy();

				console.log('✅ Server stopped cleanly\n');
				process.exit(0);
			};

			process.on('SIGINT', () => shutdown('SIGINT'));
			process.on('SIGTERM', () => shutdown('SIGTERM'));

			return server;
		},
	};
}
