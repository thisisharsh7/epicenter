import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { createEpicenterServer } from '../../src/index';
import epicenterConfig from './epicenter.config';

describe('E2E Server Tests', () => {
	let server: any;
	let baseUrl: string;

	beforeAll(async () => {
		const app = await createEpicenterServer(epicenterConfig);
		server = Bun.serve({
			fetch: app.fetch,
			port: 0, // Random available port
		});
		baseUrl = `http://localhost:${server.port}`;
	});

	afterAll(() => {
		server.stop();
	});

	describe('REST Endpoints - Basic CRUD', () => {
		test('creates a post via POST /blog/createPost', async () => {
			const response = await fetch(`${baseUrl}/blog/createPost`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: 'Test Post',
					content: 'This is a test post',
					category: 'tech',
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(data.data.title).toBe('Test Post');
			expect(data.data.category).toBe('tech');
			expect(data.data.published).toBe(false);
		});

		test('adds a comment via POST /blog/addComment', async () => {
			// Create a post first
			const postResponse = await fetch(`${baseUrl}/blog/createPost`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: 'Post with Comments',
					category: 'tutorial',
				}),
			});
			const postData = await postResponse.json();
			const postId = postData.data.id;

			// Add comment
			const response = await fetch(`${baseUrl}/blog/addComment`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					postId,
					author: 'Test User',
					content: 'Great post!',
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(data.data.author).toBe('Test User');
			expect(data.data.postId).toBe(postId);
		});
	});

	describe('MCP Protocol', () => {
		test('lists all available MCP tools', async () => {
			const response = await fetch(`${baseUrl}/mcp/tools/list`, {
				method: 'POST',
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.tools).toBeDefined();
			expect(Array.isArray(data.tools)).toBe(true);

			const toolNames = data.tools.map((t: any) => t.name);
			expect(toolNames).toContain('blog_createPost');
			expect(toolNames).toContain('blog_getAllPosts');
			expect(toolNames).toContain('blog_publishPost');
		});

		test('calls MCP tool to create a post', async () => {
			const response = await fetch(`${baseUrl}/mcp/tools/call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'blog_createPost',
					arguments: {
						title: 'MCP Test Post',
						category: 'tutorial',
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
			expect(result.category).toBe('tutorial');
		});

		test('calls MCP tool to add a comment', async () => {
			// Create a post first
			const postResponse = await fetch(`${baseUrl}/mcp/tools/call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'blog_createPost',
					arguments: {
						title: 'Post for MCP Comment',
						category: 'tech',
					},
				}),
			});
			const postData = await postResponse.json();
			const post = JSON.parse(postData.content[0].text);

			// Add comment via MCP
			const response = await fetch(`${baseUrl}/mcp/tools/call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: 'blog_addComment',
					arguments: {
						postId: post.id,
						author: 'MCP User',
						content: 'Comment via MCP',
					},
				}),
			});

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.isError).toBeUndefined();
			const comment = JSON.parse(data.content[0].text);
			expect(comment.author).toBe('MCP User');
		});
	});
});
