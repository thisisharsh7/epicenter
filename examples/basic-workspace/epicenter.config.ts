import { z } from 'zod';
import { Ok } from 'wellcrafted/result';
import {
	defineWorkspace,
	id,
	text,
	integer,
	select,
	generateId,
	sqliteIndex,
	defineQuery,
	defineMutation,
	isNotNull,
	eq,
	type ValidatedRow,
} from '../../packages/epicenter/src/index';

/**
 * Example blog workspace
 * Demonstrates the basic structure of an Epicenter workspace
 */

export default defineWorkspace({
	id: 'blog',
	version: '1',
	name: 'blog',

	schema: {
		posts: {
			id: id(),
			title: text(),
			content: text({ nullable: true }),
			category: select({ options: ['tech', 'personal', 'tutorial'] }),
			views: integer({ default: 0 }),
			publishedAt: text({ nullable: true }),
		},
		comments: {
			id: id(),
			postId: text(),
			author: text(),
			content: text(),
			createdAt: text(),
		},
	},

	indexes: ({ db }) => ({
		sqlite: sqliteIndex({ db, databaseUrl: 'file:test-data/blog.db' }),
	}),

	actions: ({ db, indexes }) => ({
		// Query: Get all published posts
		getPublishedPosts: defineQuery({
			handler: async () => {
				const posts = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(isNotNull(indexes.sqlite.posts.publishedAt))
					.all();
				return Ok(posts);
			},
		}),

		// Query: Get post by ID
		getPost: defineQuery({
			input: z.object({ id: z.string() }),
			handler: async ({ id }) => {
				const post = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.id, id))
					.get();
				return Ok(post);
			},
		}),

		// Query: Get comments for a post
		getPostComments: defineQuery({
			input: z.object({ postId: z.string() }),
			handler: async ({ postId }) => {
				const comments = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.comments)
					.where(eq(indexes.sqlite.comments.postId, postId))
					.all();
				return Ok(comments);
			},
		}),

		// Mutation: Create a new post
		createPost: defineMutation({
			input: z.object({
				title: z.string(),
				content: z.string().optional(),
				category: z.enum(['tech', 'personal', 'tutorial']),
			}),
			handler: async ({ title, content, category }) => {
				const post = {
					id: generateId(),
					title,
					content: content ?? '',
					category,
					views: 0,
					publishedAt: null,
				} satisfies ValidatedRow<typeof db.schema.posts>;
				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Publish a post
		publishPost: defineMutation({
			input: z.object({ id: z.string() }),
			handler: async ({ id }) => {
				const result = db.tables.posts.get(id);
				if (!result.row) {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					publishedAt: new Date().toISOString(),
				});
				const updatedPost = db.tables.posts.get(id).row!;
				return Ok(updatedPost);
			},
		}),

		// Mutation: Add a comment
		addComment: defineMutation({
			input: z.object({
				postId: z.string(),
				author: z.string(),
				content: z.string(),
			}),
			handler: async ({ postId, author, content }) => {
				const comment = {
					id: generateId(),
					postId,
					author,
					content,
					createdAt: new Date().toISOString(),
				} satisfies ValidatedRow<typeof db.schema.comments>;
				db.tables.comments.insert(comment);
				return Ok(comment);
			},
		}),

		// Mutation: Increment post views
		incrementViews: defineMutation({
			input: z.object({ id: z.string() }),
			handler: async ({ id }) => {
				const result = db.tables.posts.get(id);
				if (!result.row) {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					views: result.row.views + 1,
				});
				const updatedPost = db.tables.posts.get(id).row!;
				return Ok(updatedPost);
			},
		}),
	}),
});
