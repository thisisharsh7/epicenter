import type { EpicenterConfig } from '../../core/epicenter';
import { createHttpServer } from '../../server/http';

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

	const httpApp = await createHttpServer(config);
	const port = options.port || Number.parseInt(process.env.PORT || '3000');

	const server = Bun.serve({
		fetch: httpApp.fetch,
		port,
		development: options.dev ?? true,
	});

	console.log('\n🚀 Epicenter HTTP Server Running!\n');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	console.log(`📍 Server: http://localhost:${port}`);
	console.log(`🔌 MCP Endpoint: http://localhost:${port}/mcp\n`);

	console.log('📚 REST API Endpoints:\n');
	for (const workspace of config.workspaces) {
		const actionKeys = Object.keys(
			workspace.actions({ db: {} as any, indexes: {} as any, workspaces: {} as any }),
		);
		for (const actionName of actionKeys) {
			const method = actionName.startsWith('get') ? 'GET ' : 'POST';
			console.log(
				`  ${method} http://localhost:${port}/${workspace.name}/${actionName}`,
			);
		}
	}

	console.log('\n🔧 Connect to Claude Code:\n');
	console.log(
		`  claude mcp add ${config.id} --transport http --scope user http://localhost:${port}/mcp\n`,
	);

	console.log('📦 Available Tools:\n');
	for (const workspace of config.workspaces) {
		console.log(`  • ${workspace.name}`);
		const actionKeys = Object.keys(
			workspace.actions({ db: {} as any, indexes: {} as any, workspaces: {} as any }),
		);
		for (const actionName of actionKeys) {
			console.log(`    └─ ${workspace.name}_${actionName}`);
		}
		console.log();
	}

	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	console.log('Server is running. Press Ctrl+C to stop.\n');
}
