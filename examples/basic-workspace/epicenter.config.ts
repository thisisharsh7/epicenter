import path from 'node:path';
import {
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	id,
	integer,
	isNotNull,
	type SerializedRow,
	select,
	text,
} from '@epicenter/hq';
import { markdownProvider, MarkdownProviderErr } from '@epicenter/hq/providers/markdown';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

/**
 * Example blog workspace
 * Demonstrates the basic structure of an Epicenter workspace
 */

const blogWorkspace = defineWorkspace({
	id: 'blog',

	tables: {
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

	providers: {
		persistence: setupPersistence,
		sqlite: (c) => sqliteProvider(c),
		markdown: (context) =>
			markdownProvider(context, {
				tableConfigs: {
					posts: {
						serialize: ({ row: { id, content, ...row } }) => ({
							frontmatter: Object.fromEntries(
								Object.entries(row).filter(([_, v]) => v != null),
							),
							body: content ?? '',
							filename: `${id}.md`,
						}),
						deserialize: ({ frontmatter, body, filename, table }) => {
							// Extract id from filename
							const id = path.basename(filename, '.md');

							// Validate frontmatter using schema
							const FrontMatter = table.validators
								.toArktype()
								.omit('id', 'content');
							const frontmatterParsed = FrontMatter(frontmatter);

							if (frontmatterParsed instanceof type.errors) {
								return MarkdownProviderErr({
									message: `Invalid frontmatter for post ${id}`,
									context: {
										filename,
										id,
										reason: frontmatterParsed,
									},
								});
							}

							// Construct the full row
							const row = {
								id,
								content: body,
								...frontmatterParsed,
							} satisfies SerializedRow<typeof table.schema>;

							return Ok(row);
						},
						extractRowIdFromFilename: (filename) =>
							path.basename(filename, '.md'),
					},
					comments: {
						serialize: ({ row: { id, ...row } }) => ({
							frontmatter: Object.fromEntries(
								Object.entries(row).filter(([_, v]) => v != null),
							),
							body: '',
							filename: `${id}.md`,
						}),
						deserialize: ({ frontmatter, filename, table }) => {
							// Extract id from filename
							const id = path.basename(filename, '.md');

							// Validate frontmatter using validators
							const FrontMatter = table.validators.toArktype().omit('id');
							const frontmatterParsed = FrontMatter(frontmatter);

							if (frontmatterParsed instanceof type.errors) {
								return MarkdownProviderErr({
									message: `Invalid frontmatter for comment ${id}`,
									context: { filename, id, reason: frontmatterParsed },
								});
							}

							// Construct the full row
							const row = {
								id,
								...frontmatterParsed,
							} satisfies SerializedRow<typeof table.schema>;

							return Ok(row);
						},
						extractRowIdFromFilename: (filename) =>
							path.basename(filename, '.md'),
					},
				},
			}),
	},

	exports: ({ tables, providers }) => ({
		// Query: Get all published posts
		getPublishedPosts: defineQuery({
			handler: async () => {
				const posts = await providers.sqlite.db
					.select()
					.from(providers.sqlite.posts)
					.where(isNotNull(providers.sqlite.posts.publishedAt));
				return Ok(posts);
			},
		}),

		// Query: Get post by ID
		getPost: defineQuery({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const post = await providers.sqlite.db
					.select()
					.from(providers.sqlite.posts)
					.where(eq(providers.sqlite.posts.id, id));
				return Ok(post);
			},
		}),

		// Query: Get comments for a post
		getPostComments: defineQuery({
			input: type({ postId: 'string' }),
			handler: async ({ postId }) => {
				const comments = await providers.sqlite.db
					.select()
					.from(providers.sqlite.comments)
					.where(eq(providers.sqlite.comments.postId, postId));
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
				} satisfies typeof tables.posts.$inferSerializedRow;
				tables.posts.upsert(post);
				return Ok(post);
			},
		}),

		// Mutation: Publish a post
		publishPost: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const { status, row } = tables.posts.get({ id });
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				tables.posts.update({
					id,
					publishedAt: new Date().toISOString(),
				});
				const { row: updatedPost } = tables.posts.get({ id });
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
				} satisfies typeof tables.comments.$inferSerializedRow;
				tables.comments.upsert(comment);
				return Ok(comment);
			},
		}),

		// Mutation: Increment post views
		incrementViews: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const { status, row } = tables.posts.get({ id });
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				tables.posts.update({
					id,
					views: row.views + 1,
				});
				const { row: updatedPost } = tables.posts.get({ id });
				return Ok(updatedPost);
			},
		}),
	}),
});

export default [blogWorkspace] as const;
