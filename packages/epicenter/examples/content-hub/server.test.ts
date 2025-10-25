/**
 * Content Hub Server Tests
 *
 * User-friendly tests that demonstrate how to:
 * - Start a server programmatically
 * - Make HTTP requests to test endpoints
 * - Verify responses
 *
 * Run with: bun test server.test.ts
 */

import { test, expect, describe, beforeAll } from 'bun:test';
import { createServer } from '../../src/index';
import { defineEpicenter } from '../../src/core/epicenter';
import { pages } from './epicenter.config';

describe('Content Hub Server', () => {
	let server: any;
	let baseUrl: string;

	beforeAll(async () => {
		// Create the Epicenter app
		const contentHub = defineEpicenter({
			id: 'content-hub-test',
			workspaces: [pages],
		});

		// Create the server
		const { app, websocket } = await createServer(contentHub);

		// Start server on random port
		server = Bun.serve({
			fetch: app.fetch,
			websocket,
			port: 0, // Random available port
		});

		baseUrl = `http://localhost:${server.port}`;
	});

	test('creates a page', async () => {
		const response = await fetch(`${baseUrl}/pages/createPage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: 'Test Blog Post',
				content: 'This is a test post about testing',
				type: 'blog',
				tags: 'tech',
			}),
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data.data).toBeDefined();
		expect(data.data.title).toBe('Test Blog Post');
		expect(data.data.type).toBe('blog');
		expect(data.data.id).toBeDefined();
	});

	test('gets all pages', async () => {
		// First create a page
		await fetch(`${baseUrl}/pages/createPage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: 'Another Post',
				content: 'More content',
				type: 'article',
				tags: 'lifestyle',
			}),
		});

		// Then get all pages
		const response = await fetch(`${baseUrl}/pages/getPages`);

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data.data).toBeDefined();
		expect(Array.isArray(data.data)).toBe(true);
		expect(data.data.length).toBeGreaterThan(0);
	});

	test('gets a specific page by id', async () => {
		// Create a page
		const createResponse = await fetch(`${baseUrl}/pages/createPage`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: 'Specific Page',
				content: 'Find me!',
				type: 'guide',
				tags: 'education',
			}),
		});

		const created = await createResponse.json();
		const pageId = created.data.id;

		// Get that specific page
		const response = await fetch(`${baseUrl}/pages/getPage?id=${pageId}`);

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data.data).toBeDefined();
		expect(data.data.id).toBe(pageId);
		expect(data.data.title).toBe('Specific Page');
	});

	test('lists MCP tools', async () => {
		const response = await fetch(`${baseUrl}/mcp/tools/list`, {
			method: 'POST',
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data.tools).toBeDefined();
		expect(Array.isArray(data.tools)).toBe(true);

		// Should have our workspace actions as tools
		const toolNames = data.tools.map((t: any) => t.name);
		expect(toolNames).toContain('pages_getPages');
		expect(toolNames).toContain('pages_getPage');
		expect(toolNames).toContain('pages_createPage');
	});

	test('calls MCP tool to create page', async () => {
		const response = await fetch(`${baseUrl}/mcp/tools/call`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: 'pages_createPage',
				arguments: {
					title: 'Created via MCP',
					content: 'This page was created using the MCP protocol',
					type: 'tutorial',
					tags: 'coding',
				},
			}),
		});

		expect(response.status).toBe(200);
		const data = await response.json();

		expect(data.content).toBeDefined();
		expect(data.content[0].type).toBe('text');
		expect(data.isError).toBeUndefined();

		const result = JSON.parse(data.content[0].text);
		expect(result.title).toBe('Created via MCP');
		expect(result.type).toBe('tutorial');
	});
});
