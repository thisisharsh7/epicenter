#!/usr/bin/env bun
/**
 * Epicenter HTTP Server
 *
 * This demonstrates how to run an Epicenter server that:
 * - Serves REST API endpoints for your workspace actions
 * - Provides MCP (Model Context Protocol) over HTTP
 * - Supports both single workspace and multi-workspace servers
 *
 * Run with: bun run server-http.ts
 */

import { createHttpServer, defineEpicenter } from '../../src/index';
import { DEFAULT_PORT } from '../../src/cli/commands/serve';
import { pages } from './epicenter.config';

// Define your Epicenter app with all workspaces
const contentHub = defineEpicenter({
	id: 'content-hub',
	workspaces: [pages],
});

// Create and start the server
const app = await createHttpServer(contentHub);

const PORT = process.env.PORT ?? DEFAULT_PORT;

const server = Bun.serve({
	fetch: app.fetch,
	port: PORT,
	development: true,
});

console.log('\n🚀 Epicenter HTTP Server Running!\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`📍 Server: http://localhost:${PORT}`);
console.log(`🔌 MCP Endpoint: http://localhost:${PORT}/mcp\n`);

console.log('📚 REST API Endpoints:\n');
console.log(`  GET  http://localhost:${PORT}/pages/getPages`);
console.log(`  GET  http://localhost:${PORT}/pages/getPage?id=<id>`);
console.log(`  POST http://localhost:${PORT}/pages/createPage\n`);

console.log('💡 Test REST API:\n');
console.log('  # List all pages');
console.log(`  curl http://localhost:${PORT}/pages/getPages\n`);
console.log('  # Create a page');
console.log(`  curl -X POST http://localhost:${PORT}/pages/createPage \\`);
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"title":"My First Post","content":"Hello world","type":"blog","tags":"tech"}\'\n');

console.log('🔧 Connect to Claude Code:\n');
console.log(`  claude mcp add content-hub --transport http --scope user http://localhost:${PORT}/mcp\n`);
console.log('  For authentication, add headers with --header flag:');
console.log(`  claude mcp add content-hub --transport http --scope user http://localhost:${PORT}/mcp \\`);
console.log('    --header "Authorization: Bearer your-token"\n');

console.log('📦 Available Tools:\n');
for (const workspace of contentHub.workspaces) {
	console.log(`  • ${workspace.name}`);
	const actionKeys = Object.keys(workspace.actions({ db: {} as any, indexes: {} as any }));
	for (const actionName of actionKeys) {
		console.log(`    └─ ${workspace.name}_${actionName}`);
	}
	console.log();
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('Server is running. Press Ctrl+C to stop.\n');
