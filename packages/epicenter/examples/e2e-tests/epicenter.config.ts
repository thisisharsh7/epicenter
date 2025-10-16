import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	defineEpicenter,
	defineWorkspace,
	id,
	text,
	integer,
	select,
	boolean,
	generateId,
	sqliteIndex,
	markdownIndex,
	defineQuery,
	defineMutation,
	isNotNull,
	eq,
	type ValidatedRow,
} from '../../src/index';

/**
 * Comprehensive E2E test workspace
 * Demonstrates all Epicenter features: schema types, indexes, queries, mutations
 */

const blogWorkspace = defineWorkspace({
	id: 'blog',
	version: 1,
	name: 'blog',

	schema: {
		posts: {
			id: id(),
			title: text(),
			content: text({ nullable: true }),
			category: select({ options: ['tech', 'personal', 'tutorial'] }),
			views: integer({ default: 0 }),
			published: boolean({ default: false }),
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
		markdown: markdownIndex({ db, storagePath: './test-data/content' }),
	}),

	actions: ({ db, indexes }) => ({
		// Query: Get all published posts
		getPublishedPosts: defineQuery({
			description: 'Get all published blog posts',
			handler: async () => {
				const posts = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(isNotNull(indexes.sqlite.posts.publishedAt))
					.all();
				return Ok(posts);
			},
		}),

		// Query: Get all posts
		getAllPosts: defineQuery({
			description: 'Get all blog posts',
			handler: async () => {
				const posts = indexes.sqlite.db.select().from(indexes.sqlite.posts).all();
				return Ok(posts);
			},
		}),

		// Query: Get post by ID
		getPost: defineQuery({
			input: Type.Object({ id: Type.String() }),
			description: 'Get a single post by ID',
			handler: async ({ id }) => {
				const post = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.id, id))
					.get();
				return Ok(post);
			},
		}),

		// Query: Get posts by category
		getPostsByCategory: defineQuery({
			input: Type.Object({
				category: Type.Union([
					Type.Literal('tech'),
					Type.Literal('personal'),
					Type.Literal('tutorial'),
				]),
			}),
			description: 'Get all posts in a specific category',
			handler: async ({ category }) => {
				const posts = indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.category, category))
					.all();
				return Ok(posts);
			},
		}),

		// Query: Get comments for a post
		getPostComments: defineQuery({
			input: Type.Object({ postId: Type.String() }),
			description: 'Get all comments for a post',
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
			input: Type.Object({
				title: Type.String(),
				content: Type.Optional(Type.String()),
				category: Type.Union([
					Type.Literal('tech'),
					Type.Literal('personal'),
					Type.Literal('tutorial'),
				]),
			}),
			description: 'Create a new blog post',
			handler: async ({ title, content, category }) => {
				const post = {
					id: generateId(),
					title,
					content: content ?? '',
					category,
					views: 0,
					published: false,
					publishedAt: null,
				} satisfies ValidatedRow<typeof db.schema.posts>;
				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Publish a post
		publishPost: defineMutation({
			input: Type.Object({ id: Type.String() }),
			description: 'Publish a blog post',
			handler: async ({ id }) => {
				const { status } = db.tables.posts.get(id);
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					published: true,
					publishedAt: new Date().toISOString(),
				});
				const { row: updatedPost } = db.tables.posts.get(id);
				return Ok(updatedPost);
			},
		}),

		// Mutation: Unpublish a post
		unpublishPost: defineMutation({
			input: Type.Object({ id: Type.String() }),
			description: 'Unpublish a blog post',
			handler: async ({ id }) => {
				const { status } = db.tables.posts.get(id);
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					published: false,
					publishedAt: null,
				});
				const { row: updatedPost } = db.tables.posts.get(id);
				return Ok(updatedPost);
			},
		}),

		// Mutation: Delete a post
		deletePost: defineMutation({
			input: Type.Object({ id: Type.String() }),
			description: 'Delete a blog post',
			handler: async ({ id }) => {
				db.tables.posts.delete(id);
				return Ok(undefined);
			},
		}),

		// Mutation: Add a comment
		addComment: defineMutation({
			input: Type.Object({
				postId: Type.String(),
				author: Type.String(),
				content: Type.String(),
			}),
			description: 'Add a comment to a post',
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
			input: Type.Object({ id: Type.String() }),
			description: 'Increment view count for a post',
			handler: async ({ id }) => {
				const { status, row } = db.tables.posts.get(id);
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					views: row.views + 1,
				});
				const { row: updatedPost } = db.tables.posts.get(id);
				return Ok(updatedPost);
			},
		}),
	}),
});

export default defineEpicenter({
	id: 'e2e-test-workspace',
	workspaces: [blogWorkspace],
});
