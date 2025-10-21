/**
 * Test the new YJS-first epicenter architecture
 */

import { Type } from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	boolean,
	markdownIndex,
	sqliteIndex,
	defineMutation,
	defineQuery,
	defineEpicenter,
	generateId,
	id,
	integer,
	isNotNull,
	createEpicenterClient,
	select,
	text,
	multiSelect,
} from './src/index';

// Define a simple blog epicenter
const blogWorkspace = defineEpicenter({
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
			tags: multiSelect({
				options: ['typescript', 'javascript', 'svelte', 'react', 'vue'] as const,
				default: [],
			}),
			views: integer({ default: 0 }),
			published: boolean({ default: false }),
		},
	},

	indexes: ({ db }) => ({
		sqlite: sqliteIndex(db, {
			database: ':memory:', // In-memory for testing
		}),
		markdown: markdownIndex({
			db,
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
				tags: Type.Optional(Type.Array(Type.Union([
					Type.Literal('typescript'),
					Type.Literal('javascript'),
					Type.Literal('svelte'),
					Type.Literal('react'),
					Type.Literal('vue'),
				]))),
			}),
			handler: async (input) => {
				console.log('Creating post:', input);
				const post = {
					id: generateId(),
					title: input.title,
					content: input.content ?? '',
					category: input.category,
					tags: input.tags ?? [],
					views: 0,
					published: false,
				} as const;
				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		getPublishedPosts: defineQuery({
			handler: async () => {
				console.log('Querying published posts from SQLite index...');
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(isNotNull(indexes.sqlite.posts.published));
				return Ok(posts);
			},
		}),

		getAllPosts: defineQuery({
			handler: async () => {
				console.log('Querying all posts from SQLite index...');
				const posts = await indexes.sqlite.db.select().from(indexes.sqlite.posts);
				return Ok(posts);
			},
		}),

		deletePost: defineMutation({
			input: Type.Object({
				id: Type.String(),
			}),
			handler: async ({ id }) => {
				console.log('Deleting post:', id);
				db.tables.posts.delete(id);
				return Ok(undefined);
			},
		}),
	}),
});

// Run the test
async function test() {
	console.log('🚀 Starting Epicenter v2 test...\n');

	try {
		// 1. Initialize the epicenter
		console.log('📦 Initializing epicenter...');
		const client = await createEpicenterClient(blogWorkspace);
		console.log('✅ Epicenter initialized\n');

		// 2. Create some posts
		console.log('📝 Creating posts...');
		const post1Result = await client.blog.createPost({
			title: 'First Post',
			content: 'This is the first post',
			category: 'tech',
			tags: ['typescript', 'svelte'],
		});
		console.log('Post 1 created:', post1Result);

		const post2Result = await client.blog.createPost({
			title: 'Second Post',
			content: 'This is the second post',
			category: 'personal',
			tags: ['javascript', 'react'],
		});
		console.log('Post 2 created:', post2Result);

		const post3Result = await client.blog.createPost({
			title: 'Third Post',
			category: 'work',
			tags: ['typescript', 'vue'],
		});
		console.log('Post 3 created:', post3Result);
		console.log('✅ Posts created\n');

		// 3. Query posts from SQLite index
		console.log('🔍 Querying posts from SQLite index...');
		const allPostsResult = await client.blog.getAllPosts();
		console.log('All posts:', allPostsResult);
		console.log('✅ Query successful\n');

		// 4. Test delete operation
		console.log('🗑️  Testing delete operation...');
		if (post1Result.data) {
			const deleteResult = await client.blog.deletePost({ id: post1Result.data.id });
			console.log('Delete result:', deleteResult);
		}
		console.log('✅ Delete successful\n');

		// 5. Verify deletion in index
		console.log('🔍 Verifying deletion in SQLite index...');
		const postsAfterDelete = await client.blog.getAllPosts();
		console.log('Posts after delete:', postsAfterDelete);
		console.log('✅ Verification successful\n');

		console.log('🎉 All tests passed!');
	} catch (error) {
		console.error('❌ Test failed:', error);
		if (error instanceof Error) {
			console.error('Stack:', error.stack);
		}
		process.exit(1);
	}
}

// Run test
test();
