import type { EpicenterConfig } from '../../core/epicenter';
import { createHttpServer } from '../../server/http';

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

	const { app, client } = await createHttpServer(config);
	const port = options.port ?? Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT));

	const server = Bun.serve({
		fetch: app.fetch,
		port,
		development: options.dev ?? true,
	});

	console.log('\n🚀 Epicenter HTTP Server Running!\n');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	console.log(`📍 Server: http://localhost:${port}`);
	console.log(`🔌 MCP Endpoint: http://localhost:${port}/mcp\n`);

	console.log('📚 REST API Endpoints:\n');
	for (const [workspaceName, workspaceClient] of Object.entries(client)) {
		if (workspaceName === 'destroy') continue;
		const actionKeys = Object.keys(workspaceClient as any).filter(
			(key) => typeof workspaceClient[key] === 'function' && key !== 'destroy'
		);
		for (const actionName of actionKeys) {
			const method = actionName.startsWith('get') ? 'GET ' : 'POST';
			console.log(
				`  ${method} http://localhost:${port}/${workspaceName}/${actionName}`,
			);
		}
	}

	console.log('\n🔧 Connect to Claude Code:\n');
	console.log(
		`  claude mcp add ${config.id} --transport http --scope user http://localhost:${port}/mcp\n`,
	);

	console.log('📦 Available Tools:\n');
	for (const [workspaceName, workspaceClient] of Object.entries(client)) {
		if (workspaceName === 'destroy') continue;
		console.log(`  • ${workspaceName}`);
		const actionKeys = Object.keys(workspaceClient).filter(
			(key) => typeof workspaceClient[key] === 'function' && key !== 'destroy'
		);
		for (const actionName of actionKeys) {
			console.log(`    └─ ${workspaceName}_${actionName}`);
		}
		console.log();
	}

	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	console.log('Server is running. Press Ctrl+C to stop.\n');
}
