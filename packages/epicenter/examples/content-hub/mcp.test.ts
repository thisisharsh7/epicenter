import { test, expect, beforeAll, afterAll } from 'bun:test';
import type { Server } from 'bun';
import {
	createServer,
	defineEpicenter,
	defineWorkspace,
	id,
	text,
	select,
	sqliteIndex,
	defineQuery,
	defineMutation,
	generateId,
	eq,
	type Row,
} from '../../src/index';
import { setupPersistence } from '../../src/core/workspace/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

/**
 * Basic MCP Integration Tests
 *
 * These tests verify that:
 * 1. The MCP endpoint is accessible
 * 2. It responds with the correct content type (SSE)
 * 3. The REST endpoints work correctly
 *
 * For full MCP testing, connect to Claude Code and test manually.
 *
 * Run with: bun test mcp.test.ts
 */

let server: Server;
const PORT = 3123;
const BASE_URL = `http://localhost:${PORT}`;

// Create a test workspace with its own database to avoid locking issues
const testPages = defineWorkspace({
	id: 'pages',
	version: 1,

	schema: {
		pages: {
			id: id(),
			title: text(),
			content: text(),
			type: select({ options: ['blog', 'article', 'guide', 'tutorial', 'news'] }),
			tags: select({ options: ['tech', 'lifestyle', 'business', 'education', 'entertainment'] }),
		},
	},

	indexes: {
		sqlite: (db) => sqliteIndex(db),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		getPages: defineQuery({
			handler: async () => {
				const pages = await indexes.sqlite.db.select().from(indexes.sqlite.pages);
				return Ok(pages);
			},
		}),

		getPage: defineQuery({
			input: type({ id: "string" }),
			handler: async ({ id }) => {
				const page = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.pages)
					.where(eq(indexes.sqlite.pages.id, id));
				return Ok(page);
			},
		}),

		createPage: defineMutation({
			input: type({
				title: "string",
				content: "string",
				type: "'blog' | 'article' | 'guide' | 'tutorial' | 'news'",
				tags: "'tech' | 'lifestyle' | 'business' | 'education' | 'entertainment'",
			}),
			handler: async (data) => {
				const page = {
					id: generateId(),
					...data,
				} satisfies Row<typeof db.schema.pages>;
				db.tables.pages.insert(page);
				return Ok(page);
			},
		}),
	}),
});

beforeAll(async () => {
	const contentHub = defineEpicenter({
		id: 'content-hub-test',
		workspaces: [testPages],
	});

	const { app, websocket } = await createServer(contentHub);

	server = Bun.serve({
		fetch: app.fetch,
		websocket,
		port: PORT,
	});
});

afterAll(() => {
	server?.stop();
});

test('server starts successfully', () => {
	expect(server).toBeDefined();
	expect(server.port).toBe(PORT);
});

test('MCP endpoint is accessible and returns SSE', async () => {
	const response = await fetch(`${BASE_URL}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
		},
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: 1,
			method: 'tools/list',
			params: {},
		}),
	});

	expect(response.ok).toBe(true);
	expect(response.headers.get('content-type')).toContain('text/event-stream');
});

test('REST endpoint: GET /pages/getPages', async () => {
	const response = await fetch(`${BASE_URL}/pages/getPages`);

	expect(response.ok).toBe(true);
	const data = await response.json();
	expect(data.data).toBeArray();
});

test('REST endpoint: POST /pages/createPage', async () => {
	const response = await fetch(`${BASE_URL}/pages/createPage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			title: 'Test Post',
			content: 'Test content',
			type: 'blog',
			tags: 'tech',
		}),
	});

	expect(response.ok).toBe(true);
	const data = await response.json();
	expect(data.data.id).toBeDefined();
	expect(data.data.title).toBe('Test Post');
});

test('REST endpoint: GET /pages/getPage with id', async () => {
	// First create a page
	const createResponse = await fetch(`${BASE_URL}/pages/createPage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			title: 'Specific Page',
			content: 'Content',
			type: 'article',
			tags: 'tech',
		}),
	});

	const created = await createResponse.json();
	const pageId = created.data.id;

	// Then get it
	const response = await fetch(`${BASE_URL}/pages/getPage?id=${pageId}`);

	expect(response.ok).toBe(true);
	const data = await response.json();
	expect(data.data).toBeArray();
	expect(data.data[0].id).toBe(pageId);
	expect(data.data[0].title).toBe('Specific Page');
});
