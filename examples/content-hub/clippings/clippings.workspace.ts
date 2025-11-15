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
	select,
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
import { QUALITY_OPTIONS } from '../shared/quality';

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
		landingPages: {
			id: id(),
			url: text(),
			title: text(),
			designQuality: select({ options: QUALITY_OPTIONS }),
			addedAt: date(),
		},
		gitHubReadmes: {
			id: id(),
			url: text(),
			title: text(),
			description: text({ nullable: true }),
			content: text(),
			taste: select({ options: QUALITY_OPTIONS }),
			addedAt: date(),
		},
		docSites: {
			id: id(),
			url: text(),
			title: text(),
			quality: select({ options: QUALITY_OPTIONS }),
			addedAt: date(),
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
							} satisfies SerializedRow<typeof table.schema>;
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

		/**
		 * Get all landing pages
		 */
		getLandingPages: db.tables.landingPages.getAll,

		/**
		 * Get a specific landing page by ID
		 */
		getLandingPage: db.tables.landingPages.get,

		/**
		 * Update a landing page
		 */
		updateLandingPage: db.tables.landingPages.update,

		/**
		 * Delete a landing page
		 */
		deleteLandingPage: db.tables.landingPages.delete,

		/**
		 * Add a landing page
		 */
		addLandingPage: defineMutation({
			input: type({
				url: 'string',
				title: 'string',
				designQuality: type.enumerated(...QUALITY_OPTIONS),
			}),
			handler: async ({ url, title, designQuality }) => {
				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				db.tables.landingPages.insert({
					id: generateId(),
					url,
					title,
					designQuality,
					addedAt: now,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Get all GitHub repos
		 */
		getGitHubReadmes: db.tables.gitHubReadmes.getAll,

		/**
		 * Get a specific GitHub repo by ID
		 */
		getGitHubReadme: db.tables.gitHubReadmes.get,

		/**
		 * Update a GitHub repo
		 */
		updateGitHubReadme: db.tables.gitHubReadmes.update,

		/**
		 * Delete a GitHub repo
		 */
		deleteGitHubReadme: db.tables.gitHubReadmes.delete,

		/**
		 * Add a GitHub repository
		 *
		 * Fetches the GitHub repo page, extracts the README content using Defuddle,
		 * and stores it with your taste rating.
		 */
		addGitHubRepo: defineMutation({
			input: type({
				url: 'string',
				taste: type.enumerated(...QUALITY_OPTIONS),
				title: 'string | null',
				description: 'string | null',
			}),
			handler: async ({ url, taste, title, description }) => {
				// Fetch and parse GitHub page using JSDOM
				const { data: dom, error: fetchError } = await tryAsync({
					try: () => JSDOM.fromURL(url),
					catch: (error) =>
						Err({
							message: 'Failed to fetch GitHub repo',
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
							message: 'Failed to extract README content',
							context: {
								url,
								error: extractErrorMessage(error),
							},
						}),
				});

				if (parseError) return Err(parseError);

				// Extract repo name from URL if title not provided
				let finalTitle = title;
				if (!finalTitle) {
					const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
					if (match) {
						finalTitle = `${match[1]}/${match[2]}`;
					} else {
						finalTitle = result.title;
					}
				}

				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				db.tables.gitHubReadmes.insert({
					id: generateId(),
					url,
					title: finalTitle,
					description: description || result.description || null,
					content: result.content,
					taste,
					addedAt: now,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Get all documentation sites
		 */
		getDocSites: db.tables.docSites.getAll,

		/**
		 * Get a specific documentation site by ID
		 */
		getDocSite: db.tables.docSites.get,

		/**
		 * Update a documentation site
		 */
		updateDocSite: db.tables.docSites.update,

		/**
		 * Delete a documentation site
		 */
		deleteDocSite: db.tables.docSites.delete,

		/**
		 * Add a documentation website
		 */
		addDocSite: defineMutation({
			input: type({
				url: 'string',
				title: 'string',
				quality: type.enumerated(...QUALITY_OPTIONS),
			}),
			handler: async ({ url, title, quality }) => {
				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				db.tables.docSites.insert({
					id: generateId(),
					url,
					title,
					quality,
					addedAt: now,
				});

				return Ok(undefined);
			},
		}),

		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
		pullToSqlite: indexes.sqlite.pullToSqlite,
	}),
});
