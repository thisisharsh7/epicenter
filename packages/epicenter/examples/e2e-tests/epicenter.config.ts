import { type } from 'arktype';
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
	type Row,
} from '../../src/index';
import { setupPersistence } from '../../src/core/workspace/providers';

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

	indexes: {
		sqlite: (db) => sqliteIndex(db),
		markdown: (db) => markdownIndex(db, { storagePath: './.data/content' }),
	},

	// Use universal persistence helper
	// Stores YJS document at ./.epicenter/blog.yjs (desktop) or IndexedDB (browser)
	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		// Query: Get all published posts
		getPublishedPosts: defineQuery({
			description: 'Get all published blog posts',
			handler: async () => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(isNotNull(indexes.sqlite.posts.publishedAt));
				return Ok(posts);
			},
		}),

		// Query: Get all posts
		getAllPosts: defineQuery({
			description: 'Get all blog posts',
			handler: async () => {
				const posts = await indexes.sqlite.db.select().from(indexes.sqlite.posts);
				return Ok(posts);
			},
		}),

		// Query: Get post by ID
		getPost: defineQuery({
			input: type({ id: "string" }),
			description: 'Get a single post by ID',
			handler: async ({ id }) => {
				const post = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.id, id));
				return Ok(post);
			},
		}),

		// Query: Get posts by category
		getPostsByCategory: defineQuery({
			input: type({
				category: "'tech' | 'personal' | 'tutorial'",
			}),
			description: 'Get all posts in a specific category',
			handler: async ({ category }) => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.category, category));
				return Ok(posts);
			},
		}),

		// Query: Get comments for a post
		getPostComments: defineQuery({
			input: type({ postId: "string" }),
			description: 'Get all comments for a post',
			handler: async ({ postId }) => {
				const comments = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.comments)
					.where(eq(indexes.sqlite.comments.postId, postId));
				return Ok(comments);
			},
		}),

		// Mutation: Create a new post
		createPost: defineMutation({
			input: type({
				title: "string",
				content: "string?",
				category: "'tech' | 'personal' | 'tutorial'",
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
				} satisfies Row<typeof db.schema.posts>;
				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Publish a post
		publishPost: defineMutation({
			input: type({ id: "string" }),
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
			input: type({ id: "string" }),
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
			input: type({ id: "string" }),
			description: 'Delete a blog post',
			handler: async ({ id }) => {
				db.tables.posts.delete(id);
				return Ok(undefined);
			},
		}),

		// Mutation: Add a comment
		addComment: defineMutation({
			input: type({
				postId: "string",
				author: "string",
				content: "string",
			}),
			description: 'Add a comment to a post',
			handler: async ({ postId, author, content }) => {
				const comment = {
					id: generateId(),
					postId,
					author,
					content,
					createdAt: new Date().toISOString(),
				} satisfies Row<typeof db.schema.comments>;
				db.tables.comments.insert(comment);
				return Ok(comment);
			},
		}),

		// Mutation: Increment post views
		incrementViews: defineMutation({
			input: type({ id: "string" }),
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
	},
});

export default defineEpicenter({
	id: 'e2e-test-workspace',
	workspaces: [blogWorkspace],
});
