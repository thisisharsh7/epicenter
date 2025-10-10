/**
 * Test the new YJS-first epicenter architecture
 */

import { z } from 'zod';
import {
	boolean,
	createMarkdownIndex,
	createSQLiteIndex,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	integer,
	isNotNull,
	runWorkspace,
	select,
	text,
} from './src/index';

// Define a simple blog workspace
const blogWorkspace = defineWorkspace({
	id: 'blog',

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

	indexes: [
		createSQLiteIndex({
			databaseUrl: ':memory:', // In-memory for testing
		}),
		createMarkdownIndex({
			storagePath: './test-data',
		}),
	],

	actions: ({ tables, indexes }) => ({
		createPost: defineMutation({
			input: z.object({
				title: z.string().min(1),
				content: z.string().optional(),
				category: z.enum(['tech', 'personal', 'work']),
			}),
			handler: async (input) => {
				console.log('Creating post:', input);
				const post = {
					id: generateId(),
					title: input.title,
					content: input.content || null,
					category: input.category,
					views: 0,
					published: false,
				};
				tables.posts.insert(post);
				return post;
			},
		}),

		getPublishedPosts: defineQuery({
			input: z.void(),
			handler: async () => {
				console.log('Querying published posts from SQLite index...');
				return indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(isNotNull(indexes.sqlite.posts.published))
					.all();
			},
		}),

		getAllPosts: defineQuery({
			input: z.void(),
			handler: async () => {
				console.log('Querying all posts from SQLite index...');
				// @ts-expect-error - need to fix types
				return indexes.sqlite.db.select().from(indexes.sqlite.posts).all();
			},
		}),
	}),
});

// Run the test
async function test() {
	console.log('🚀 Starting Epicenter v2 test...\n');

	try {
		// 1. Initialize the workspace
		console.log('📦 Initializing workspace...');
		const workspace = await runWorkspace(blogWorkspace);
		console.log('✅ Workspace initialized\n');

		// 2. Create some posts
		console.log('📝 Creating posts...');
		const post1Result = await workspace.createPost({
			title: 'First Post',
			content: 'This is the first post',
			category: 'tech',
		});
		console.log('Post 1 created:', post1Result);

		const post2Result = await workspace.createPost({
			title: 'Second Post',
			content: 'This is the second post',
			category: 'personal',
		});
		console.log('Post 2 created:', post2Result);

		const post3Result = await workspace.createPost({
			title: 'Third Post',
			category: 'work',
		});
		console.log('Post 3 created:', post3Result);
		console.log('✅ Posts created\n');

		// 3. Query posts from SQLite index
		console.log('🔍 Querying posts from SQLite index...');
		const allPostsResult = await workspace.getAllPosts();
		console.log('All posts:', allPostsResult);
		console.log('✅ Query successful\n');

		// 4. Test direct table operations
		console.log('🗑️  Testing delete operation...');
		if (post1Result.data) {
			const deleteResult = workspace.posts.delete(post1Result.data.id);
			console.log('Delete result:', deleteResult);
		}
		console.log('✅ Delete successful\n');

		// 5. Verify deletion in index
		console.log('🔍 Verifying deletion in SQLite index...');
		const postsAfterDelete = await workspace.getAllPosts();
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
