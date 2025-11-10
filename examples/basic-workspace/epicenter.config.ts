import {
	type SerializedRow,
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
	sqliteIndex,
	text,
	validateRow,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

/**
 * Example blog workspace
 * Demonstrates the basic structure of an Epicenter workspace
 */

const blogWorkspace = defineWorkspace({
	id: 'blog',

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

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (context) =>
			markdownIndex(context, {
				tableConfigs: {
					posts: {
						serialize: ({ row, tableName }) => {
							const { id, content, ...rest } = row;
							return {
								frontmatter: Object.fromEntries(
									Object.entries(rest).filter(([_, v]) => v != null),
								),
								body: content ?? '',
							};
						},
						deserialize: ({ id, frontmatter, body, tableName, schema }) => {
							// Combine body with frontmatter
							const serializedRow = {
								id,
								content: body,
								...frontmatter,
							};

							// Validate using schema
							const validationResult = validateRow({
								data: serializedRow,
								schema,
							});

							if (validationResult.status !== 'valid') {
								console.warn(
									`Invalid markdown file for ${tableName}/${id}:`,
									validationResult,
								);
								return null; // Skip this file
							}

							// Return the full row (including id)
							return serializedRow as any;
						},
					},
					comments: {
						serialize: ({ row }) => {
							const { id, ...rest } = row;
							return {
								frontmatter: Object.fromEntries(
									Object.entries(rest).filter(([_, v]) => v != null),
								),
								body: '',
							};
						},
						deserialize: ({ id, frontmatter, schema }) => {
							const serializedRow = {
								id,
								...frontmatter,
							};

							const validationResult = validateRow({
								data: serializedRow,
								schema,
							});

							if (validationResult.status !== 'valid') {
								console.warn(
									`Invalid markdown file for comments/${id}:`,
									validationResult,
								);
								return null;
							}

							return serializedRow as any;
						},
					},
				},
			}),
	},

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
			input: type({ id: 'string' }),
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
			input: type({ postId: 'string' }),
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
				title: 'string',
				'content?': 'string',
				category: "'tech' | 'personal' | 'tutorial'",
			}),
			handler: async ({ title, content, category }) => {
				const post = {
					id: generateId(),
					title,
					content: content ?? '',
					category,
					views: 0,
					publishedAt: null,
				} satisfies SerializedRow<typeof db.schema.posts>;
				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Publish a post
		publishPost: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const { status, row } = db.tables.posts.get({ id });
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					publishedAt: new Date().toISOString(),
				});
				const { row: updatedPost } = db.tables.posts.get({ id });
				return Ok(updatedPost);
			},
		}),

		// Mutation: Add a comment
		addComment: defineMutation({
			input: type({
				postId: 'string',
				author: 'string',
				content: 'string',
			}),
			handler: async ({ postId, author, content }) => {
				const comment = {
					id: generateId(),
					postId,
					author,
					content,
					createdAt: new Date().toISOString(),
				} satisfies SerializedRow<typeof db.schema.comments>;
				db.tables.comments.insert(comment);
				return Ok(comment);
			},
		}),

		// Mutation: Increment post views
		incrementViews: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const { status, row } = db.tables.posts.get({ id });
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				db.tables.posts.update({
					id,
					views: row.views + 1,
				});
				const { row: updatedPost } = db.tables.posts.get({ id });
				return Ok(updatedPost);
			},
		}),
	}),

	// Use isomorphic persistence
	// Stores YJS document at .epicenter/blog.yjs (auto-resolved)
	providers: [setupPersistence],
});

export default defineEpicenter({
	id: 'basic-workspace-example',
	workspaces: [blogWorkspace],
});
