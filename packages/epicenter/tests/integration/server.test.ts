import { beforeAll, describe, expect, test } from 'bun:test';
import { type } from 'arktype';
import { eq } from 'drizzle-orm';
import { Ok } from 'wellcrafted/result';
import { createClient } from '../../src/core/workspace/client.node';
import {
	boolean,
	createServer,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	integer,
	select,
	text,
} from '../../src/index.node';
import { sqliteProvider } from '../../src/indexes/sqlite';

// Helper to parse SSE response from MCP endpoint
async function parseMcpResponse(response: Response): Promise<any> {
	const text = await response.text();
	// SSE format: "event: message\ndata: {json}\n\n"
	const dataLine = text.split('\n').find((line) => line.startsWith('data: '));
	if (!dataLine) throw new Error('No data in SSE response');
	return JSON.parse(dataLine.substring(6)); // Remove "data: " prefix
}

describe('Server Integration Tests', () => {
	// Define a simple blog workspace
	const blogWorkspace = defineWorkspace({
		id: 'blog',

		tables: {
			posts: {
				id: id(),
				title: text(),
				content: text({ nullable: true }),
				category: select({
					options: ['tech', 'personal', 'work'],
				}),
				views: integer({ default: 0 }),
				published: boolean({ default: false }),
			},
		},

		providers: {
			sqlite: (c) => sqliteProvider(c),
		},

		actions: ({ tables, providers }) => ({
			createPost: defineMutation({
				input: type({
					title: 'string >= 1',
					'content?': 'string',
					category: "'tech' | 'personal' | 'work'",
				}),
				description: 'Create a new blog post',
				handler: async (input) => {
					const post = {
						id: generateId(),
						title: input.title,
						content: input.content ?? '',
						category: input.category,
						views: 0,
						published: false,
					};
					tables.posts.upsert(post);
					return Ok(post);
				},
			}),

			getAllPosts: defineQuery({
				description: 'Get all blog posts',
				handler: async () => {
					const posts = await providers.sqlite.db
						.select()
						.from(providers.sqlite.posts);
					return Ok(posts);
				},
			}),

			getPostsByCategory: defineQuery({
				input: type({
					category: "'tech' | 'personal' | 'work'",
				}),
				description: 'Get posts by category',
				handler: async ({ category }) => {
					const posts = await providers.sqlite.db
						.select()
						.from(providers.sqlite.posts)
						.where(eq(providers.sqlite.posts.category, category));
					return Ok(posts);
				},
			}),
		}),
	});

	describe('Single Workspace Server', () => {
		let server: { port: number; stop: () => void };

		beforeAll(async () => {
			const client = await createClient([blogWorkspace] as const);
			const { app } = createServer(client);
			const elysiaServer = app.listen(0);
			server = {
				port: elysiaServer.server!.port,
				stop: () => elysiaServer.stop(),
			};
		});

		test('creates post via POST /workspaces/blog/createPost', async () => {
			const response = await fetch(
				`http://localhost:${server.port}/workspaces/blog/createPost`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: 'Test Post',
						content: 'This is a test',
						category: 'tech',
					}),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(data.data.title).toBe('Test Post');
			expect(data.data.category).toBe('tech');
		});

		test('gets all posts via GET /workspaces/blog/getAllPosts', async () => {
			const response = await fetch(
				`http://localhost:${server.port}/workspaces/blog/getAllPosts`,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(Array.isArray(data.data)).toBe(true);
		});

		test('gets posts by category via GET /workspaces/blog/getPostsByCategory', async () => {
			const response = await fetch(
				`http://localhost:${server.port}/workspaces/blog/getPostsByCategory?category=tech`,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(Array.isArray(data.data)).toBe(true);
		});

		test.skip('lists MCP tools via POST /mcp', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list',
				}),
			});

			expect(response.status).toBe(200);
			const data = await parseMcpResponse(response);
			expect(data.result).toBeDefined();
			expect(data.result.tools).toBeDefined();
			expect(Array.isArray(data.result.tools)).toBe(true);
			expect(data.result.tools.length).toBeGreaterThan(0);

			const createPostTool = data.result.tools.find(
				(t: any) => t.name === 'blog_createPost',
			);
			expect(createPostTool).toBeDefined();
		});

		test.skip('calls MCP tool via POST /mcp', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 2,
					method: 'tools/call',
					params: {
						name: 'blog_createPost',
						arguments: {
							title: 'MCP Test Post',
							category: 'tech',
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = await parseMcpResponse(response);
			expect(data.result).toBeDefined();
			expect(data.result.content).toBeDefined();
			expect(data.result.content[0].type).toBe('text');
			expect(data.result.isError).toBeUndefined();

			const result = JSON.parse(data.result.content[0].text);
			expect(result.title).toBe('MCP Test Post');
		});

		// TODO: Input validation with sValidator isn't working in the simplified version
		// because we're registering both GET and POST without proper schema middleware
		// test('returns 400 for invalid input', async () => {
		// 	const response = await fetch(`http://localhost:${server.port}/blog/createPost`, {
		// 		method: 'POST',
		// 		headers: { 'Content-Type': 'application/json' },
		// 		body: JSON.stringify({
		// 			title: '', // Empty title should fail validation
		// 			category: 'tech',
		// 		}),
		// 	});

		// 	expect(response.status).toBe(400);
		// });
	});

	describe('Epicenter Server', () => {
		const authWorkspace = defineWorkspace({
			id: 'auth',

			tables: {
				users: {
					id: id(),
					email: text(),
					name: text(),
				},
			},

			providers: {
				sqlite: (c) =>
					sqliteProvider(c, {
						database: ':memory:',
					}),
			},

			actions: ({ tables }) => ({
				createUser: defineMutation({
					input: type({
						email: 'string',
						name: 'string',
					}),
					description: 'Create a new user',
					handler: async (input) => {
						const user = {
							id: generateId(),
							...input,
						};
						tables.users.upsert(user);
						return Ok(user);
					},
				}),
			}),
		});

		let server: { port: number; stop: () => void };

		beforeAll(async () => {
			const client = await createClient([
				blogWorkspace,
				authWorkspace,
			] as const);
			const { app } = createServer(client);
			const elysiaServer = app.listen(0);
			server = {
				port: elysiaServer.server!.port,
				stop: () => elysiaServer.stop(),
			};
		});

		test('creates post via POST /workspaces/blog/createPost', async () => {
			const response = await fetch(
				`http://localhost:${server.port}/workspaces/blog/createPost`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: 'Epicenter Test',
						category: 'tech',
					}),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.title).toBe('Epicenter Test');
		});

		test('creates user via POST /workspaces/auth/createUser', async () => {
			const response = await fetch(
				`http://localhost:${server.port}/workspaces/auth/createUser`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: 'test@example.com',
						name: 'Test User',
					}),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.email).toBe('test@example.com');
		});

		test.skip('lists MCP tools from all workspaces', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 3,
					method: 'tools/list',
				}),
			});

			expect(response.status).toBe(200);
			const data = await parseMcpResponse(response);
			expect(data.result.tools).toBeDefined();

			const blogTools = data.result.tools.filter((t: any) =>
				t.name.startsWith('blog_'),
			);
			const authTools = data.result.tools.filter((t: any) =>
				t.name.startsWith('auth_'),
			);

			expect(blogTools.length).toBeGreaterThan(0);
			expect(authTools.length).toBeGreaterThan(0);
		});

		test.skip('calls MCP tool from specific workspace', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json, text/event-stream',
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 4,
					method: 'tools/call',
					params: {
						name: 'auth_createUser',
						arguments: {
							email: 'mcp@example.com',
							name: 'MCP User',
						},
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = await parseMcpResponse(response);
			expect(data.result.isError).toBeUndefined();

			const result = JSON.parse(data.result.content[0].text);
			expect(result.email).toBe('mcp@example.com');
		});
	});
});
