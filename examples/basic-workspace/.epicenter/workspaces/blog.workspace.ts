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
import {
	MarkdownProviderErr,
	markdownProvider,
} from '@epicenter/hq/providers/markdown';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

export default defineWorkspace({
	id: 'blog',

	tables: {
		posts: {
			id: id(),
			title: text(),
			content: text({ nullable: true }),
			category: select({ options: ['tech', 'personal', 'tutorial'] }),
			views: integer({ default: 0 }),
			published_at: text({ nullable: true }),
		},
		comments: {
			id: id(),
			post_id: text(),
			author: text(),
			content: text(),
			created_at: text(),
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
							const id = path.basename(filename, '.md');

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
							const id = path.basename(filename, '.md');

							const FrontMatter = table.validators.toArktype().omit('id');
							const frontmatterParsed = FrontMatter(frontmatter);

							if (frontmatterParsed instanceof type.errors) {
								return MarkdownProviderErr({
									message: `Invalid frontmatter for comment ${id}`,
									context: { filename, id, reason: frontmatterParsed },
								});
							}

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
		getPublishedPosts: defineQuery({
			handler: async () => {
				const posts = await providers.sqlite.db
					.select()
					.from(providers.sqlite.posts)
					.where(isNotNull(providers.sqlite.posts.published_at));
				return Ok(posts);
			},
		}),

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

		getPostComments: defineQuery({
			input: type({ post_id: 'string' }),
			handler: async ({ post_id }) => {
				const comments = await providers.sqlite.db
					.select()
					.from(providers.sqlite.comments)
					.where(eq(providers.sqlite.comments.post_id, post_id));
				return Ok(comments);
			},
		}),

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
					published_at: null,
				} satisfies typeof tables.posts.$inferSerializedRow;
				tables.posts.upsert(post);
				return Ok(post);
			},
		}),

		publishPost: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const { status, row } = tables.posts.get({ id });
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				tables.posts.update({
					id,
					published_at: new Date().toISOString(),
				});
				const { row: updatedPost } = tables.posts.get({ id });
				return Ok(updatedPost);
			},
		}),

		addComment: defineMutation({
			input: type({
				post_id: 'string',
				author: 'string',
				content: 'string',
			}),
			handler: async ({ post_id, author, content }) => {
				const comment = {
					id: generateId(),
					post_id,
					author,
					content,
					created_at: new Date().toISOString(),
				} satisfies typeof tables.comments.$inferSerializedRow;
				tables.comments.upsert(comment);
				return Ok(comment);
			},
		}),

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
