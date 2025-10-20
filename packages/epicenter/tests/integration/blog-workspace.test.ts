import { describe, expect, test, beforeEach } from 'bun:test';
import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import * as Y from 'yjs';
import {
	boolean,
	markdownIndex,
	sqliteIndex,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	integer,
	isNotNull,
	createWorkspaceClient,
	text,
	select,
	multiSelect,
	type WorkspaceClient,
} from '../../src/index';

describe('Blog Workspace Integration', () => {
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
				category: select({ options: ['tech', 'personal', 'work'] }),
				tags: multiSelect({
					options: ['typescript', 'javascript', 'svelte', 'react', 'vue'],
					default: [],
				}),
				views: integer({ default: 0 }),
				published: boolean({ default: false }),
			},
		},

		indexes: async ({ db }) => ({
			sqlite: await sqliteIndex(db, {
				database: ':memory:', // In-memory for testing
			}),
			markdown: markdownIndex(db, {
				storagePath: './test-data',
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
					tags: Type.Optional(
						Type.Array(
							Type.Union([
								Type.Literal('typescript'),
								Type.Literal('javascript'),
								Type.Literal('svelte'),
								Type.Literal('react'),
								Type.Literal('vue'),
							]),
						),
					),
				}),
				handler: async (input) => {
					const post = {
						id: generateId(),
						title: input.title,
						content: input.content ?? '',
						category: input.category,
						tags: Y.Array.from(input.tags ?? []),
						views: 0,
						published: false,
					} as const;
					db.tables.posts.insert(post);
					return Ok(post);
				},
			}),

			getPublishedPosts: defineQuery({
				handler: async () => {
					const posts = await indexes.sqlite.db
						.select()
						.from(indexes.sqlite.posts)
						.where(isNotNull(indexes.sqlite.posts.published));
					return Ok(posts);
				},
			}),

			getAllPosts: defineQuery({
				handler: async () => {
					const posts = await indexes.sqlite.db.select().from(indexes.sqlite.posts);
					return Ok(posts);
				},
			}),

			deletePost: defineMutation({
				input: Type.Object({
					id: Type.String(),
				}),
				handler: async ({ id }) => {
					db.tables.posts.delete(id);
					return Ok(undefined);
				},
			}),
		}),
	});

	let workspace!: WorkspaceClient<any>;

	beforeEach(async () => {
		workspace = await createWorkspaceClient(blogWorkspace);
	});

	test('creates posts successfully', async () => {
		const { data: post1 } = await workspace.createPost({
			title: 'First Post',
			content: 'This is the first post',
			category: 'tech',
			tags: ['typescript', 'svelte'],
		});

		expect(post1).toBeDefined();
		expect(post1?.title).toBe('First Post');
		expect(post1?.category).toBe('tech');
		expect(post1?.tags).toBeInstanceOf(Y.Array);
		expect(post1?.tags.toArray()).toEqual(['typescript', 'svelte']);
		expect(post1?.views).toBe(0);
		expect(post1?.published).toBe(false);
	});

	test('creates post without optional tags', async () => {
		const { data: post3 } = await workspace.createPost({
			title: 'Third Post',
			category: 'work',
		});

		expect(post3).toBeDefined();
		expect(post3?.title).toBe('Third Post');
		expect(post3?.content).toBe('');
		expect(post3?.tags).toBeInstanceOf(Y.Array);
		expect(post3?.tags.toArray()).toEqual([]);
	});

	test('queries all posts from SQLite index', async () => {
		// Create multiple posts
		await workspace.createPost({
			title: 'First Post',
			content: 'This is the first post',
			category: 'tech',
			tags: ['typescript', 'svelte'],
		});

		await workspace.createPost({
			title: 'Second Post',
			content: 'This is the second post',
			category: 'personal',
			tags: ['javascript', 'react'],
		});

		await workspace.createPost({
			title: 'Third Post',
			category: 'work',
			tags: ['typescript', 'vue'],
		});

		// Query all posts
		const { data: allPosts } = await workspace.getAllPosts();

		expect(allPosts).toBeDefined();
		expect(allPosts?.length).toBe(3);
	});

	test('deletes post successfully', async () => {
		// Create a post
		const { data: post1 } = await workspace.createPost({
			title: 'First Post',
			content: 'This is the first post',
			category: 'tech',
			tags: ['typescript', 'svelte'],
		});

		expect(post1).toBeDefined();
		const postId = post1!.id;

		// Verify post exists
		const { data: allPostsBeforeDelete } = await workspace.getAllPosts();
		expect(allPostsBeforeDelete?.length).toBe(1);

		// Delete the post
		await workspace.deletePost({ id: postId });

		// Verify deletion in index
		const { data: postsAfterDelete } = await workspace.getAllPosts();
		expect(postsAfterDelete?.length).toBe(0);
	});

	test('full workflow: create, query, delete, verify', async () => {
		// Create posts
		const { data: post1 } = await workspace.createPost({
			title: 'First Post',
			content: 'This is the first post',
			category: 'tech',
			tags: ['typescript', 'svelte'],
		});

		const { data: post2 } = await workspace.createPost({
			title: 'Second Post',
			content: 'This is the second post',
			category: 'personal',
			tags: ['javascript', 'react'],
		});

		const { data: post3 } = await workspace.createPost({
			title: 'Third Post',
			category: 'work',
			tags: ['typescript', 'vue'],
		});

		// All posts should be created successfully
		expect(post1).toBeDefined();
		expect(post2).toBeDefined();
		expect(post3).toBeDefined();

		// Query all posts
		const { data: allPosts } = await workspace.getAllPosts();
		expect(allPosts?.length).toBe(3);

		// Delete first post
		if (post1) {
			await workspace.deletePost({ id: post1.id });
		}

		// Verify deletion
		const { data: postsAfterDelete } = await workspace.getAllPosts();
		expect(postsAfterDelete?.length).toBe(2);

		// Verify remaining posts are correct
		const remainingTitles = postsAfterDelete?.map((p) => p.title);
		expect(remainingTitles).toContain('Second Post');
		expect(remainingTitles).toContain('Third Post');
		expect(remainingTitles).not.toContain('First Post');
	});
});
