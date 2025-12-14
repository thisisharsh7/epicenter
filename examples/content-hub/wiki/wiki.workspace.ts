import path from 'node:path';
import {
	DateWithTimezone,
	DateWithTimezoneFromString,
	date,
	defineWorkspace,
	id,
	type SerializedRow,
	select,
	tags,
	text,
} from '@epicenter/hq';
import { markdownProvider, MarkdownProviderErr, bodyFieldSerializer } from '@epicenter/hq/providers/markdown';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { QUALITY_OPTIONS } from '../shared/quality';

/**
 * Path to the blog's content collection for articles
 * This is where Astro expects content collection markdown files
 */
const BLOG_ARTICLES_PATH = '/Users/braden/Code/blog/src/content/articles';

/**
 * Wiki workspace
 *
 * Evergreen knowledge base entries that serve as the source of truth.
 * Unlike pages (which have a publishing lifecycle), wiki entries are
 * permanent reference documents that are continuously updated.
 *
 * Content flow:
 *   wiki.entries (source of truth) → posts.* (distribution)
 *
 * Two markdown providers:
 *   1. `markdown` - local storage for all wiki content
 *   2. `blog` - syncs entries to Astro blog content collection
 *
 * Wiki entries can link to each other using standard markdown links.
 * Each entry represents your authoritative take on a topic.
 */
export const wiki = defineWorkspace({
	id: 'wiki',

	tables: {
		entries: {
			id: id(),
			title: text(),
			content: text(),
			type: tags({ nullable: true }),
			tags: tags({ nullable: true }),
			resonance: select({ options: QUALITY_OPTIONS, nullable: true }),
			created_at: date(),
			updated_at: date(),
		},
	},

	providers: {
		persistence: setupPersistence,
		sqlite: (c) => sqliteProvider(c),

		/**
		 * Local markdown storage for wiki entries
		 */
		markdown: (c) =>
			markdownProvider(c, {
				tableConfigs: {
					entries: { serializer: bodyFieldSerializer('content') },
				},
			}),

		/**
		 * Blog content collection sync
		 *
		 * Syncs wiki entries to Astro's content collection format.
		 * Field names are kept consistent (no remapping).
		 * Dates are serialized as Date objects, timezone stored separately.
		 */
		blog: (c) =>
			markdownProvider(c, {
				directory: BLOG_ARTICLES_PATH,
				tableConfigs: {
					entries: {
						serializer: {
							serialize: ({ row }) => {
								const {
									id: rowId,
									content,
									title,
									type,
									tags,
									resonance,
									created_at,
									updated_at,
								} = row;

								// Destructure date and timezone from DateWithTimezoneString
								const { date: createdDate, timezone } =
									DateWithTimezoneFromString(created_at);
								const { date: updatedDate } =
									DateWithTimezoneFromString(updated_at);

								// Build frontmatter with consistent field names
								const frontmatter = {
									title,
									type,
									tags,
									resonance,
									timezone,
									created_at: createdDate,
									updated_at: updatedDate,
								};

								return {
									frontmatter,
									body: content,
									filename: `${rowId}.md`,
								};
							},

							deserialize: {
								parseFilename: (filename) => {
									const id = path.basename(filename, '.md');
									return { id };
								},

								fromContent: ({ frontmatter, body, filename, parsed, table }) => {
									const { id: rowId } = parsed;

									// Parse frontmatter with consistent field names
									const EntryFrontmatter = type({
										title: 'string',
										'type?': 'string[]',
										'tags?': 'string[]',
										'resonance?': 'string | null',
										timezone: 'string',
										created_at: 'Date',
										updated_at: 'Date',
									});

									const parsedFrontmatter = EntryFrontmatter(frontmatter);
									if (parsedFrontmatter instanceof type.errors) {
										return MarkdownProviderErr({
											message: `Invalid frontmatter for entry ${rowId}`,
											context: {
												fileName: filename,
												id: rowId,
												reason: parsedFrontmatter.summary,
											},
										});
									}

									const row = {
										id: rowId,
										title: parsedFrontmatter.title,
										content: body,
										type: parsedFrontmatter.type ?? null,
										tags: parsedFrontmatter.tags ?? null,
										resonance: parsedFrontmatter.resonance ?? null,
										created_at: DateWithTimezone({
											date: parsedFrontmatter.created_at,
											timezone: parsedFrontmatter.timezone,
										}).toJSON(),
										updated_at: DateWithTimezone({
											date: parsedFrontmatter.updated_at,
											timezone: parsedFrontmatter.timezone,
										}).toJSON(),
									} satisfies SerializedRow<typeof table.schema>;

									return Ok(row);
								},
							},
						},
					},
				},
			}),
	},

	exports: ({ tables, providers }) => ({
		...tables.entries,

		// Local markdown sync
		pullToMarkdown: providers.markdown.pullToMarkdown,
		pushFromMarkdown: providers.markdown.pushFromMarkdown,

		// Blog content collection sync
		pullToBlog: providers.blog.pullToMarkdown,
		pushFromBlog: providers.blog.pushFromMarkdown,

		// SQLite sync
		pullToSqlite: providers.sqlite.pullToSqlite,
		pushFromSqlite: providers.sqlite.pushFromSqlite,
	}),
});
