import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createServer } from '@epicenter/hq/server';
import blogWorkspace from './epicenter.config';

describe('Server Tests', () => {
	let server: { stop: () => void; port: number };
	let baseUrl: string;
	let cleanup: () => Promise<void>;

	beforeAll(async () => {
		const client = await blogWorkspace.create();
		cleanup = client.destroy;
		const { app } = createServer(client);
		const elysiaServer = app.listen(0);
		const port = elysiaServer.server!.port;
		server = { stop: () => elysiaServer.stop(), port };
		baseUrl = `http://localhost:${port}`;
	});

	afterAll(async () => {
		server?.stop();
		await cleanup?.();
	});

	describe('REST Endpoints - Basic CRUD', () => {
		test('creates a post via POST /workspaces/blog/actions/createPost', async () => {
			const response = await fetch(
				`${baseUrl}/workspaces/blog/actions/createPost`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: 'Test Post',
						content: 'This is a test post',
						category: 'tech',
					}),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(data.data.title).toBe('Test Post');
			expect(data.data.category).toBe('tech');
			expect(data.data.published_at).toBeNull();
		});

		test('adds a comment via POST /workspaces/blog/actions/addComment', async () => {
			const postResponse = await fetch(
				`${baseUrl}/workspaces/blog/actions/createPost`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						title: 'Post with Comments',
						category: 'tutorial',
					}),
				},
			);
			const postData = await postResponse.json();
			const postId = postData.data.id;

			const response = await fetch(
				`${baseUrl}/workspaces/blog/actions/addComment`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						postId,
						author: 'Test User',
						content: 'Great post!',
					}),
				},
			);

			expect(response.status).toBe(200);
			const data = await response.json();
			expect(data.data).toBeDefined();
			expect(data.data.author).toBe('Test User');
			expect(data.data.post_id).toBe(postId);
		});
	});
});
