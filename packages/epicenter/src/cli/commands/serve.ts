import { forEachAction, type EpicenterConfig } from '../../core/epicenter';
import { createServer } from '../../server/server';

export const DEFAULT_PORT = 3913;

/**
 * Options for the serve command
 */
export type ServeOptions = {
	port?: number;
	dev?: boolean;
};

/**
 * Start an HTTP server for the Epicenter app
 * Serves REST API endpoints and MCP over HTTP
 *
 * @param config - Epicenter configuration
 * @param options - Server options
 */
export async function serveCommand(
	config: EpicenterConfig,
	options: ServeOptions = {},
): Promise<void> {
	console.log(`🔨 Creating HTTP server for app: ${config.id}`);

	const { app, client, websocket } = await createServer(config);
	const port = options.port ?? Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT));

	const server = Bun.serve({
		fetch: app.fetch,
		port,
		development: options.dev ?? true,
		websocket,
	});

	console.log('\n🚀 Epicenter HTTP Server Running!\n');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	console.log(`📍 Server: http://localhost:${port}`);
	console.log(`🔌 MCP Endpoint: http://localhost:${port}/mcp\n`);

	console.log('📚 REST API Endpoints:\n');
	forEachAction(client, ({ workspaceName, actionName, action }) => {
		const method = ({ query: 'GET', mutation: 'POST' } as const)[action.type];
		console.log(`  ${method} http://localhost:${port}/${workspaceName}/${actionName}`);
	});

	console.log('\n🔧 Connect to Claude Code:\n');
	console.log(
		`  claude mcp add ${config.id} --transport http --scope user http://localhost:${port}/mcp\n`,
	);

	console.log('📦 Available Tools:\n');
	const workspaceActions = new Map<string, string[]>();
	forEachAction(client, ({ workspaceName, actionName }) => {
		if (!workspaceActions.has(workspaceName)) {
			workspaceActions.set(workspaceName, []);
		}
		workspaceActions.get(workspaceName)?.push(actionName);
	});

	for (const [workspaceName, actionNames] of workspaceActions) {
		console.log(`  • ${workspaceName}`);
		for (const actionName of actionNames) {
			console.log(`    └─ ${workspaceName}_${actionName}`);
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
		client.destroy();

		console.log('✅ Server stopped cleanly\n');
		process.exit(0);
	};

	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));
}
