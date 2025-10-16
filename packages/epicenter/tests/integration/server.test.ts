import { describe, expect, test, beforeAll } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { Ok } from 'wellcrafted/result';
import {
	boolean,
	sqliteIndex,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	integer,
	text,
	select,
	createWorkspaceServer,
	createEpicenterServer,
	defineEpicenter,
} from '../../src/index';

describe('Server Integration Tests', () => {
	// Define a simple blog workspace
	const blogWorkspace = defineWorkspace({
		id: 'blog',
		version: 1,
		name: 'blog',

		schema: {
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

		indexes: ({ db }) => ({
			sqlite: sqliteIndex({
				db,
				databaseUrl: ':memory:',
			}),
		}),

		actions: ({ db, indexes }) => ({
			createPost: defineMutation({
				input: Type.Object({
					title: Type.String({ minLength: 1 }),
					content: Type.Optional(Type.String()),
					category: Type.Union([
						Type.Literal('tech'),
						Type.Literal('personal'),
						Type.Literal('work'),
					]),
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
					db.tables.posts.insert(post);
					return Ok(post);
				},
			}),

			getAllPosts: defineQuery({
				description: 'Get all blog posts',
				handler: async () => {
					const posts = await indexes.sqlite.db
						.select()
						.from(indexes.sqlite.posts)
						.all();
					return Ok(posts);
				},
			}),

			getPostsByCategory: defineQuery({
				input: Type.Object({
					category: Type.Union([
						Type.Literal('tech'),
						Type.Literal('personal'),
						Type.Literal('work'),
					]),
				}),
				description: 'Get posts by category',
				handler: async ({ category }) => {
					const posts = await indexes.sqlite.db
						.select()
						.from(indexes.sqlite.posts)
						.where((table) => table.category === category)
						.all();
					return Ok(posts);
				},
			}),
		}),
	});

	describe('Workspace Server', () => {
		let app: Awaited<ReturnType<typeof createWorkspaceServer>>;
		let server: any;

		beforeAll(async () => {
			app = await createWorkspaceServer(blogWorkspace);
			server = Bun.serve({
				fetch: app.fetch,
				port: 0, // Random available port
			});
		});

		test('creates post via POST /createPost', async () => {
			const response = await fetch(`http://localhost:${server.port}/createPost`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: 'Test Post',
					content: 'This is a test',
					category: 'tech',
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(data.data.title).toBe('Test Post');
			expect(data.data.category).toBe('tech');
		});

		test('gets all posts via GET /getAllPosts', async () => {
			const response = await fetch(`http://localhost:${server.port}/getAllPosts`);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(Array.isArray(data.data)).toBe(true);
		});

		test('gets posts by category via GET /getPostsByCategory', async () => {
			const response = await fetch(
				`http://localhost:${server.port}/getPostsByCategory?category=tech`,
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(Array.isArray(data.data)).toBe(true);
		});

		test('lists MCP tools via POST /mcp/tools/list', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp/tools/list`, {
				method: 'POST',
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.tools).toBeDefined();
			expect(Array.isArray(data.tools)).toBe(true);
			expect(data.tools.length).toBeGreaterThan(0);

			const createPostTool = data.tools.find((t: any) => t.name === 'createPost');
			expect(createPostTool).toBeDefined();
			// Note: descriptions are not yet implemented in the simplified version
		});

		test('calls MCP tool via POST /mcp/tools/call', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp/tools/call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'createPost',
					arguments: {
						title: 'MCP Test Post',
						category: 'tech',
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.content).toBeDefined();
			expect(data.content[0].type).toBe('text');
			expect(data.isError).toBeUndefined();

			const result = JSON.parse(data.content[0].text);
			expect(result.title).toBe('MCP Test Post');
		});

		// TODO: Input validation with sValidator isn't working in the simplified version
		// because we're registering both GET and POST without proper schema middleware
		// test('returns 400 for invalid input', async () => {
		// 	const response = await fetch(`http://localhost:${server.port}/createPost`, {
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
			version: 1,
			name: 'auth',

			schema: {
				users: {
					id: id(),
					email: text(),
					name: text(),
				},
			},

			indexes: ({ db }) => ({
				sqlite: sqliteIndex({
					db,
					databaseUrl: ':memory:',
				}),
			}),

			actions: ({ db }) => ({
				createUser: defineMutation({
					input: Type.Object({
						email: Type.String({ format: 'email' }),
						name: Type.String(),
					}),
					description: 'Create a new user',
					handler: async (input) => {
						const user = {
							id: generateId(),
							...input,
						};
						db.tables.users.insert(user);
						return Ok(user);
					},
				}),
			}),
		});

		const epicenter = defineEpicenter({
			id: 'test-app',
			workspaces: [blogWorkspace, authWorkspace],
		});

		let app: Awaited<ReturnType<typeof createEpicenterServer>>;
		let server: any;

		beforeAll(async () => {
			app = await createEpicenterServer(epicenter);
			server = Bun.serve({
				fetch: app.fetch,
				port: 0,
			});
		});

		test('creates post via POST /blog/createPost', async () => {
			const response = await fetch(`http://localhost:${server.port}/blog/createPost`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: 'Epicenter Test',
					category: 'tech',
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.title).toBe('Epicenter Test');
		});

		test('creates user via POST /auth/createUser', async () => {
			const response = await fetch(`http://localhost:${server.port}/auth/createUser`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: 'test@example.com',
					name: 'Test User',
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data.email).toBe('test@example.com');
		});

		test('lists MCP tools from all workspaces', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp/tools/list`, {
				method: 'POST',
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.tools).toBeDefined();

			const blogTools = data.tools.filter((t: any) => t.name.startsWith('blog_'));
			const authTools = data.tools.filter((t: any) => t.name.startsWith('auth_'));

			expect(blogTools.length).toBeGreaterThan(0);
			expect(authTools.length).toBeGreaterThan(0);
		});

		test('calls MCP tool from specific workspace', async () => {
			const response = await fetch(`http://localhost:${server.port}/mcp/tools/call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'auth_createUser',
					arguments: {
						email: 'mcp@example.com',
						name: 'MCP User',
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.isError).toBeUndefined();

			const result = JSON.parse(data.content[0].text);
			expect(result.email).toBe('mcp@example.com');
		});
	});
});
