import Type from 'typebox';
import { Ok } from 'wellcrafted/result';
import {
	type Row,
	defineEpicenter,
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	id,
	integer,
	isNotNull,
	markdownIndex,
	select,
	setupPersistenceDesktop,
	sqliteIndex,
	text,
} from '../../src/index';

/**
 * Example blog workspace
 * Demonstrates the basic structure of an Epicenter workspace
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

	indexes: async ({ db }) => ({
		sqlite: await sqliteIndex(db, { database: '.data/blog.db' }),
		markdown: markdownIndex(db, { storagePath: './.data/content' }),
	}),

	actions: ({ db, indexes }) => ({
		// Query: Get all published posts
		getPublishedPosts: defineQuery({
			handler: async () => {
				const posts = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(isNotNull(indexes.sqlite.posts.publishedAt));
				return Ok(posts);
			},
		}),

		// Query: Get post by ID
		getPost: defineQuery({
			input: Type.Object({ id: Type.String() }),
			handler: async ({ id }) => {
				const post = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.posts)
					.where(eq(indexes.sqlite.posts.id, id));
				return Ok(post);
			},
		}),

		// Query: Get comments for a post
		getPostComments: defineQuery({
			input: Type.Object({ postId: Type.String() }),
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
			input: Type.Object({
				title: Type.String(),
				content: Type.Optional(Type.String()),
				category: Type.Union([
					Type.Literal('tech'),
					Type.Literal('personal'),
					Type.Literal('tutorial'),
				]),
			}),
			handler: async ({ title, content, category }) => {
				const post = {
					id: generateId(),
					title,
					content: content ?? '',
					category,
					views: 0,
					publishedAt: null,
				} satisfies Row<typeof db.schema.posts>;
				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Publish a post
		publishPost: defineMutation({
			input: Type.Object({ id: Type.String() }),
			handler: async ({ id }) => {
				const { status, row } = db.tables.posts.get(id);
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					publishedAt: new Date().toISOString(),
				});
				const { row: updatedPost } = db.tables.posts.get(id);
				return Ok(updatedPost);
			},
		}),

		// Mutation: Add a comment
		addComment: defineMutation({
			input: Type.Object({
				postId: Type.String(),
				author: Type.String(),
				content: Type.String(),
			}),
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
			input: Type.Object({ id: Type.String() }),
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

	// Use desktop filesystem persistence helper
	// Stores YJS document at ./.epicenter/blog.yjs
	setupYDoc: (ydoc) => setupPersistenceDesktop(ydoc),
});

export default defineEpicenter({
	id: 'basic-workspace-example',
	workspaces: [blogWorkspace],
});
