import path from 'node:path';
import {
	DateWithTimezone,
	DateWithTimezoneFromString,
	type SerializedRow,
	date,
	defineMutation,
	defineWorkspace,
	generateId,
	id,
	integer,
	isDateWithTimezoneString,
	markdownIndex,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { MarkdownIndexErr } from '@epicenter/hq/indexes/markdown';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Defuddle } from 'defuddle/node';
import { JSDOM } from 'jsdom';
import { extractErrorMessage } from 'wellcrafted/error';
import { Err, Ok, tryAsync } from 'wellcrafted/result';

/**
 * Clippings workspace
 *
 * Manages saved web content (articles, blog posts, tutorials) with full content extraction.
 * Uses Defuddle to extract and clean article content from URLs.
 */
export const clippings = defineWorkspace({
	id: 'clippings',
	schema: {
		clippings: {
			id: id(),
			url: text(),
			title: text(),
			description: text({ nullable: true }),
			author: text({ nullable: true }),
			domain: text({ nullable: true }),
			site: text({ nullable: true }),
			favicon: text({ nullable: true }),
			published: date({ nullable: true }),
			image: text({ nullable: true }),
			content: text(),
			wordCount: integer(),
			clippedAt: date(),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) =>
			markdownIndex(c, {
				tableConfigs: {
					clippings: {
						serialize: ({ row: { content, id, ...row } }) => {
							// Remove null values from frontmatter
							const frontmatter = Object.fromEntries(
								Object.entries(row).filter(([_, value]) => value !== null),
							);
							return {
								frontmatter,
								body: content,
								filename: `${id}.md`,
							};
						},
						deserialize: ({ frontmatter, body, filename, table }) => {
							const rowId = path.basename(filename, '.md');
							const FrontMatter = type({
								url: 'string',
								title: 'string',
								'description?': 'string',
								'author?': 'string',
								'domain?': 'string',
								'site?': 'string',
								'favicon?': 'string',
								'published?': type.string.filter(isDateWithTimezoneString),
								'image?': 'string',
								wordCount: 'number',
								clippedAt: type.string.filter(isDateWithTimezoneString),
							});
							const frontmatterParsed = FrontMatter(frontmatter);
							if (frontmatterParsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for row ${rowId}`,
									context: {
										fileName: filename,
										id: rowId,
										reason: frontmatterParsed,
									},
								});
							}
							// Merge with null defaults for missing optional fields
							const row = {
								id: rowId,
								content: body,
								description: null,
								author: null,
								domain: null,
								site: null,
								favicon: null,
								published: null,
								image: null,
								...frontmatterParsed,
							} satisfies SerializedRow<(typeof c.db.schema)['clippings']>;
							return Ok(row);
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		/**
		 * Get all clippings
		 */
		getClippings: db.tables.clippings.getAll,

		/**
		 * Get a specific clipping by ID
		 */
		getClipping: db.tables.clippings.get,

		/**
		 * Update a clipping
		 */
		updateClipping: db.tables.clippings.update,

		/**
		 * Delete a clipping
		 */
		deleteClipping: db.tables.clippings.delete,

		/**
		 * Add a clipping from a URL
		 *
		 * Fetches the URL using JSDOM, extracts content using Defuddle, and saves it as a clipping.
		 * Uses JSDOM for efficient single-pass parsing and better URL handling.
		 */
		addFromUrl: defineMutation({
			input: type({ url: 'string' }),
			handler: async ({ url }) => {
				// Fetch and parse HTML using JSDOM
				const { data: dom, error: fetchError } = await tryAsync({
					try: () => JSDOM.fromURL(url),
					catch: (error) =>
						Err({
							message: 'Failed to fetch URL',
							context: {
								url,
								error: extractErrorMessage(error),
							},
						}),
				});

				if (fetchError) return Err(fetchError);

				// Extract content with Defuddle using the parsed DOM
				const { data: result, error: parseError } = await tryAsync({
					try: () => Defuddle(dom, url, { markdown: true }),
					catch: (error) =>
						Err({
							message: 'Failed to parse content',
							context: {
								url,
								error: extractErrorMessage(error),
							},
						}),
				});

				if (parseError) return Err(parseError);

				// Generate ID and timestamps
				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				// Insert into database
				db.tables.clippings.insert({
					id: generateId(),
					url,
					title: result.title,
					description: result.description === '' ? null : result.description,
					author: result.author === '' ? null : result.author,
					domain: result.domain === '' ? null : result.domain,
					site: result.site === '' ? null : result.site,
					favicon: result.favicon === '' ? null : result.favicon,
					published: result.published
						? DateWithTimezone({
								date: new Date(result.published),
								timezone: 'UTC',
							}).toJSON()
						: null,
					image: result.image === '' ? null : result.image,
					content: result.content,
					wordCount: result.wordCount,
					clippedAt: now,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Remove duplicate clippings
		 *
		 * Compares clippings by URL and keeps only the most recently clipped version.
		 * Deletes older duplicates based on clippedAt timestamp.
		 */
		removeDuplicates: defineMutation({
			handler: () => {
				type Clipping = SerializedRow<(typeof db.schema)['clippings']>;

				// Convert rows to JSON
				const clippings: Clipping[] = db.tables.clippings
					.getAll()
					.map((row) => row.toJSON());

				// Group by URL
				const urlMap = new Map<string, Clipping[]>();
				for (const clipping of clippings) {
					if (!urlMap.has(clipping.url)) {
						urlMap.set(clipping.url, []);
					}
					urlMap.get(clipping.url)?.push(clipping);
				}

				// Collect IDs to delete (keep only the most recent for each URL)
				const idsToDelete = Array.from(urlMap.values()).flatMap(
					(duplicates) => {
						if (duplicates.length <= 1) {
							return [];
						}

						// Find the most recent clipping
						const newest = duplicates.reduce((max, current) => {
							const maxTime = DateWithTimezoneFromString(
								max.clippedAt,
							).date.getTime();
							const currentTime = DateWithTimezoneFromString(
								current.clippedAt,
							).date.getTime();
							return currentTime > maxTime ? current : max;
						});

						// Return IDs of all others
						return duplicates
							.filter((clipping) => clipping.id !== newest.id)
							.map((clipping) => clipping.id);
					},
				);

				// Delete all duplicates in one batch operation
				db.tables.clippings.deleteMany({ ids: idsToDelete });

				return Ok({ deletedCount: idsToDelete.length });
			},
		}),

		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
		pullToSqlite: indexes.sqlite.pullToSqlite,
	}),
});
