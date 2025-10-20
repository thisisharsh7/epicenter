#!/usr/bin/env bun
/**
 * Content Hub Server Example
 *
 * This demonstrates how to run an Epicenter server that:
 * - Serves REST API endpoints for your workspace actions
 * - Provides MCP (Model Context Protocol) integration
 * - Supports both single workspace and multi-workspace servers
 *
 * Run with: bun run server.ts
 * Then test with: curl http://localhost:3000/pages/getPages
 */

import { createEpicenterServer } from '../../src/index';
import { defineEpicenter } from '../../src/core/epicenter';
import { pages } from './epicenter.config';

// Define your Epicenter app with all workspaces
const contentHub = defineEpicenter({
	id: 'content-hub',
	workspaces: [pages],
});

// Create and start the server
const app = await createEpicenterServer(contentHub);

const PORT = process.env.PORT || 3000;

const server = Bun.serve({
	fetch: app.fetch,
	port: PORT,
	development: true,
});

console.log('\n🚀 Content Hub Server Running!\n');
console.log(`📍 Server URL: http://localhost:${PORT}`);
console.log('\n📚 Available Endpoints:\n');
console.log('  REST API:');
console.log(`    GET  http://localhost:${PORT}/pages/getPages`);
console.log(`    GET  http://localhost:${PORT}/pages/getPage?id=<id>`);
console.log(`    POST http://localhost:${PORT}/pages/createPage`);
console.log('\n  MCP (Model Context Protocol):');
console.log(`    POST http://localhost:${PORT}/mcp/tools/list`);
console.log(`    POST http://localhost:${PORT}/mcp/tools/call`);
console.log('\n💡 Try these commands:\n');
console.log('  # List all pages');
console.log(`  curl http://localhost:${PORT}/pages/getPages\n`);
console.log('  # Create a page');
console.log(`  curl -X POST http://localhost:${PORT}/pages/createPage \\`);
console.log('    -H "Content-Type: application/json" \\');
console.log('    -d \'{"title":"My First Post","content":"Hello world","type":"blog","tags":"tech"}\'\n');
console.log('  # List MCP tools');
console.log(`  curl -X POST http://localhost:${PORT}/mcp/tools/list\n`);
console.log('Press Ctrl+C to stop\n');
