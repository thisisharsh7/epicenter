#!/usr/bin/env bun
/**
 * Start Epicenter as an MCP Server
 *
 * This script starts the Epicenter server optimized for MCP (Model Context Protocol) usage.
 * It provides clear instructions for connecting to Claude Code.
 *
 * Run with: bun run start-mcp.ts
 */

import { createHttpServer, defineEpicenter } from '../../src/index';
import { pages } from './epicenter.config';

// Define your Epicenter app
const contentHub = defineEpicenter({
	id: 'content-hub',
	workspaces: [pages],
});

// Create the HTTP server (REST + MCP endpoints)
const app = await createHttpServer(contentHub);

const PORT = process.env.PORT || 3000;

const server = Bun.serve({
	fetch: app.fetch,
	port: PORT,
	development: true,
});

console.log('\n🤖 Epicenter MCP Server Started!\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`📍 Server: http://localhost:${PORT}`);
console.log(`🔌 MCP Endpoint: http://localhost:${PORT}/mcp\n`);

console.log('🔧 Add to Claude Code:\n');
console.log('   Option 1: Using CLI (Recommended)');
console.log('   ────────────────────────────────────────────────');
console.log(
	`   claude mcp add epicenter-content-hub --scope user -- \\`
);
console.log(`     curl -X POST http://localhost:${PORT}/mcp \\`);
console.log('     -H "Content-Type: application/json" \\');
console.log('     -H "Accept: application/json, text/event-stream" \\');
console.log('     --data-binary "@-" --no-buffer');
console.log('\n   Option 2: Manual Configuration');
console.log('   ────────────────────────────────────────────────');
console.log('   Edit ~/.claude.json and add:\n');
console.log('   {');
console.log('     "mcpServers": {');
console.log('       "epicenter-content-hub": {');
console.log('         "command": "curl",');
console.log('         "args": [');
console.log('           "-X", "POST",');
console.log(`           "http://localhost:${PORT}/mcp",`);
console.log('           "-H", "Content-Type: application/json",');
console.log('           "-H", "Accept: application/json, text/event-stream",');
console.log('           "--data-binary", "@-",');
console.log('           "--no-buffer"');
console.log('         ]');
console.log('       }');
console.log('     }');
console.log('   }\n');

console.log('📦 Available Workspaces & Actions:\n');

// List all workspaces and their actions
for (const workspace of contentHub.workspaces) {
	console.log(`   • ${workspace.name}`);

	// Get all action names from the workspace
	const actionKeys = Object.keys(workspace.actions({ db: {} as any, indexes: {} as any }));

	for (const actionName of actionKeys) {
		console.log(`     └─ ${workspace.name}_${actionName}`);
	}
	console.log();
}

console.log('💡 Test in Claude Code:\n');
console.log('   @epicenter-content-hub what tools do you have?');
console.log('   @epicenter-content-hub get all pages');
console.log(
	'   @epicenter-content-hub create a blog post titled "Hello" with content "World" tagged as tech\n'
);

console.log('📚 Documentation: ./MCP.md\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('Server is running. Press Ctrl+C to stop.\n');
