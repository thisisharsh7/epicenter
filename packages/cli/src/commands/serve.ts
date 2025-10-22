import { createHttpServer } from '@epicenter/hq';
import { findConfig } from '../utils/find-config';

type ServeOptions = {
	port?: number;
	dev?: boolean;
};

export async function serve(options: ServeOptions = {}) {
	const configPath = findConfig();

	if (!configPath) {
		console.error('❌ No epicenter.config.ts found in current directory');
		console.error(
			'   Create an epicenter.config.ts file that exports your Epicenter app',
		);
		process.exit(1);
	}

	console.log(`📦 Loading config from ${configPath}`);

	try {
		const config = await import(configPath);
		const app = config.default;

		if (!app) {
			console.error(
				'❌ epicenter.config.ts must export a default Epicenter app',
			);
			console.error('   Example:');
			console.error('   export default defineEpicenter({ ... })');
			process.exit(1);
		}

		console.log(`🔨 Creating HTTP server for app: ${app.id}`);

		const httpApp = await createHttpServer(app);
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
		for (const workspace of app.workspaces) {
			const actionKeys = Object.keys(
				workspace.actions({ db: {} as any, indexes: {} as any }),
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
			`  claude mcp add ${app.id} --transport http --scope user http://localhost:${port}/mcp\n`,
		);

		console.log('📦 Available Tools:\n');
		for (const workspace of app.workspaces) {
			console.log(`  • ${workspace.name}`);
			const actionKeys = Object.keys(
				workspace.actions({ db: {} as any, indexes: {} as any }),
			);
			for (const actionName of actionKeys) {
				console.log(`    └─ ${workspace.name}_${actionName}`);
			}
			console.log();
		}

		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
		console.log('Server is running. Press Ctrl+C to stop.\n');
	} catch (error) {
		console.error('❌ Failed to start server:', error);
		process.exit(1);
	}
}
