import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { setupPersistence } from '../../src/core/workspace/providers/persistence/desktop';
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
	sqliteIndex,
	text,
	validateRow,
} from '../../src/index';

/**
 * Example blog workspace
 * Demonstrates the basic structure of an Epicenter workspace
 */

const blogWorkspace = defineWorkspace({
	id: 'blog',
	version: 1,

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
		sqlite: (db) => sqliteIndex(db),
		markdown: (db) =>
			markdownIndex(db, {
				rootPath: path.join(import.meta.dirname, '.data/content'),
				pathToTableAndId: ({ path: filePath }) => {
					const parts = filePath.split(path.sep);
					if (parts.length < 2) {
						throw new Error(`Invalid file path: ${filePath}`);
					}
					const tableName = parts[0]!;
					const fileName = parts[parts.length - 1]!;
					const id = path.basename(fileName, '.md');
					return { tableName, id };
				},
				tableAndIdToPath: ({ id, tableName }) =>
					path.join(tableName, `${id}.md`),
				serializers: {
					posts: {
						serialize: ({ row, tableName }) => {
							const { id, content, ...rest } = row;
							return {
								frontmatter: Object.fromEntries(
									Object.entries(rest).filter(([_, v]) => v != null),
								),
								content: content || '',
							};
						},
						deserialize: ({ id, frontmatter, content, tableName, schema }) => {
							// Combine content with frontmatter
							const serializedRow = {
								id,
								content,
								...frontmatter,
							};

							// Validate using schema
							const validationResult = validateRow({
								data: serializedRow,
								schema,
							});

							if (validationResult.status !== 'valid') {
								console.warn(`Invalid markdown file for ${tableName}/${id}:`, validationResult);
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
								content: '',
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
								console.warn(`Invalid markdown file for comments/${id}:`, validationResult);
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
				} satisfies Row<typeof db.schema.posts>;
				db.tables.posts.insert(post);
				return Ok(post);
			},
		}),

		// Mutation: Publish a post
		publishPost: defineMutation({
			input: type({ id: 'string' }),
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
				} satisfies Row<typeof db.schema.comments>;
				db.tables.comments.insert(comment);
				return Ok(comment);
			},
		}),

		// Mutation: Increment post views
		incrementViews: defineMutation({
			input: type({ id: 'string' }),
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

	// Use desktop persistence with absolute path
	// Stores YJS document at examples/basic-workspace/.epicenter/blog.yjs
	providers: [
		setupPersistence({
			storagePath: path.join(import.meta.dirname, '.epicenter'),
		}),
	],
});

export default defineEpicenter({
	id: 'basic-workspace-example',
	workspaces: [blogWorkspace],
});
