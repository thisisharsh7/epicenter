import { openapi } from '@elysiajs/openapi';
import { Elysia } from 'elysia';
import { Err, isResult, Ok } from 'wellcrafted/result';
import type { WorkspaceExports } from '../core/actions';
import type {
	AnyWorkspaceConfig,
	EpicenterClient,
	WorkspaceClient,
	WorkspacesToClients,
} from '../core/workspace';
import { iterActions } from '../core/workspace';
import { createSyncPlugin } from './sync';

export const DEFAULT_PORT = 3913;

export type StartServerOptions = {
	port?: number;
};

/**
 * Create a server from an initialized Epicenter client.
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
 * // - http://localhost:3913/workspaces/blog/createPost (REST)
 * // - ws://localhost:3913/sync/blog (WebSocket sync)
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
					] as WorkspaceClient<WorkspaceExports> | undefined;
					return workspace?.$ydoc;
				},
			}),
		)
		.get('/', () => ({
			name: 'Epicenter API',
			version: '1.0.0',
			docs: '/openapi',
		}));

	for (const { workspaceId, actionPath, action } of iterActions(client)) {
		const path = `/workspaces/${workspaceId}/${actionPath.join('/')}`;
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
			console.log(`📖 Scalar Docs: http://localhost:${port}/scalar`);
			console.log(`📄 OpenAPI Spec: http://localhost:${port}/openapi`);
			console.log(`🔌 MCP Endpoint: http://localhost:${port}/mcp\n`);

			console.log('📚 REST API Endpoints:\n');
			for (const { workspaceId, actionPath, action } of iterActions(client)) {
				const method = ({ query: 'GET', mutation: 'POST' } as const)[
					action.type
				];
				const restPath = `/workspaces/${workspaceId}/${actionPath.join('/')}`;
				console.log(`  ${method} http://localhost:${port}${restPath}`);
			}

			console.log('\n🔧 Connect to Claude Code:\n');
			console.log(
				`  claude mcp add my-epicenter --transport http --scope user http://localhost:${port}/mcp\n`,
			);

			console.log('📦 Available Tools:\n');
			const actionsByWorkspace = Object.groupBy(
				iterActions(client),
				(info) => info.workspaceId,
			);

			for (const [workspaceId, actions] of Object.entries(actionsByWorkspace)) {
				console.log(`  • ${workspaceId}`);
				for (const { actionPath } of actions ?? []) {
					const mcpToolName = [workspaceId, ...actionPath].join('_');
					console.log(`    └─ ${mcpToolName}`);
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
