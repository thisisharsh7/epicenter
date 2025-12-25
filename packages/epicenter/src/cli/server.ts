import { iterActions } from '../core/epicenter';
import type { AnyWorkspaceConfig } from '../core/workspace';
import type { CreateClientOptions } from '../core/workspace/client.node';
import { createServer } from '../server/server';

export const DEFAULT_PORT = 3913;

/**
 * Options for the serve command.
 */
export type ServeOptions = CreateClientOptions & {
	/** Port to run the server on. Defaults to 3913. */
	port?: number;
};

/**
 * Start an HTTP server for the Epicenter app.
 * Serves REST API endpoints and MCP over HTTP.
 *
 * @param workspaces - Array of workspace configurations
 * @param options - Server options including port and storageDir
 */
export async function startServer<
	const TWorkspaces extends readonly AnyWorkspaceConfig[],
>(workspaces: TWorkspaces, options: ServeOptions = {}): Promise<void> {
	console.log(`🔨 Creating HTTP server for epicenter...`);

	const { port: _, ...clientOptions } = options;
	const { app, client } = await createServer(workspaces, clientOptions);
	const port =
		options.port ??
		Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);

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
		const method = ({ query: 'GET', mutation: 'POST' } as const)[action.type];
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
}
