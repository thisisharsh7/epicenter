import path, { join } from 'node:path';
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
	markdown,
	MarkdownProviderErr,
} from '@epicenter/hq/capabilities/markdown';
import { persistence } from '@epicenter/hq/capabilities/persistence';
import { sqlite } from '@epicenter/hq/capabilities/sqlite';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

const projectDir = import.meta.dirname;
const epicenterDir = join(projectDir, '..');

export default defineWorkspace({
	id: 'blog',
	name: 'Blog',
	kv: {},

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
})
	.withCapabilities({
		persistence: (ctx) =>
			persistence(ctx, {
				filePath: join(epicenterDir, 'persistence', `${ctx.id}.yjs`),
			}),
		sqlite: (ctx) =>
			sqlite(ctx, {
				dbPath: join(epicenterDir, 'sqlite', `${ctx.id}.db`),
				logsDir: join(epicenterDir, 'sqlite', 'logs'),
			}),
		markdown: (ctx) =>
			markdown(ctx, {
				directory: join(projectDir, ctx.id),
				logsDir: join(epicenterDir, 'markdown', 'logs'),
				diagnosticsPath: join(epicenterDir, 'markdown', `${ctx.id}.diagnostics.json`),
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
	})
	.withActions({
		getPublishedPosts: defineQuery({
			output: type({
				id: 'string',
				title: 'string',
				'content?': 'string | null',
				category: "'tech' | 'personal' | 'tutorial'",
				views: 'number',
				'published_at?': 'string | null',
			}).array(),
			handler: async (ctx) => {
				const posts = await ctx.capabilities.sqlite.db
					.select()
					.from(ctx.capabilities.sqlite.posts)
					.where(isNotNull(ctx.capabilities.sqlite.posts.published_at));
				return Ok(posts);
			},
		}),

		getPost: defineQuery({
			input: type({ id: 'string' }),
			output: type({
				id: 'string',
				title: 'string',
				'content?': 'string | null',
				category: "'tech' | 'personal' | 'tutorial'",
				views: 'number',
				'published_at?': 'string | null',
			}).array(),
			handler: async ({ id }, ctx) => {
				const post = await ctx.capabilities.sqlite.db
					.select()
					.from(ctx.capabilities.sqlite.posts)
					.where(eq(ctx.capabilities.sqlite.posts.id, id));
				return Ok(post);
			},
		}),

		getPostComments: defineQuery({
			input: type({ post_id: 'string' }),
			output: type({
				id: 'string',
				post_id: 'string',
				author: 'string',
				content: 'string',
				created_at: 'string',
			}).array(),
			handler: async ({ post_id }, ctx) => {
				const comments = await ctx.capabilities.sqlite.db
					.select()
					.from(ctx.capabilities.sqlite.comments)
					.where(eq(ctx.capabilities.sqlite.comments.post_id, post_id));
				return Ok(comments);
			},
		}),

		createPost: defineMutation({
			input: type({
				title: 'string',
				'content?': 'string',
				category: "'tech' | 'personal' | 'tutorial'",
			}),
			output: type({
				id: 'string',
				title: 'string',
				'content?': 'string | null',
				category: "'tech' | 'personal' | 'tutorial'",
				views: 'number',
				'published_at?': 'string | null',
			}),
			handler: async ({ title, content, category }, ctx) => {
				const post = {
					id: generateId(),
					title,
					content: content ?? '',
					category,
					views: 0,
					published_at: null,
				};
				ctx.tables.posts.upsert(post);
				return Ok(post);
			},
		}),

		publishPost: defineMutation({
			input: type({ id: 'string' }),
			output: type({
				id: 'string',
				title: 'string',
				'content?': 'string | null',
				category: "'tech' | 'personal' | 'tutorial'",
				views: 'number',
				'published_at?': 'string | null',
			}),
			handler: async ({ id }, ctx) => {
				const { status, row } = ctx.tables.posts.get(id);
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				ctx.tables.posts.update({
					id,
					published_at: new Date().toISOString(),
				});
				const { row: updatedPost } = ctx.tables.posts.get(id);
				return Ok(updatedPost);
			},
		}),

		addComment: defineMutation({
			input: type({
				postId: 'string',
				author: 'string',
				content: 'string',
			}),
			output: type({
				id: 'string',
				post_id: 'string',
				author: 'string',
				content: 'string',
				created_at: 'string',
			}),
			handler: async ({ postId, author, content }, ctx) => {
				const comment = {
					id: generateId(),
					post_id: postId,
					author,
					content,
					created_at: new Date().toISOString(),
				};
				ctx.tables.comments.upsert(comment);
				return Ok(comment);
			},
		}),

		incrementViews: defineMutation({
			input: type({ id: 'string' }),
			output: type({
				id: 'string',
				title: 'string',
				'content?': 'string | null',
				category: "'tech' | 'personal' | 'tutorial'",
				views: 'number',
				'published_at?': 'string | null',
			}),
			handler: async ({ id }, ctx) => {
				const { status, row } = ctx.tables.posts.get(id);
				if (status !== 'valid') {
					throw new Error(`Post ${id} not found`);
				}
				ctx.tables.posts.update({
					id,
					views: row.views + 1,
				});
				const { row: updatedPost } = ctx.tables.posts.get(id);
				return Ok(updatedPost);
			},
		}),
	});
