import {
	DateWithTimezone,
	DateWithTimezoneFromString,
	date,
	defineMutation,
	defineWorkspace,
	generateId,
	id,
	integer,
	markdownIndex,
	select,
	sqliteIndex,
	text,
	withBodyField,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';
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
		articles: {
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
			word_count: integer(),
			quality: select({ options: QUALITY_OPTIONS, nullable: true }),
			hacker_news_url: text({ nullable: true }),
			saved_at: date(),
		},
		landing_pages: {
			id: id(),
			url: text(),
			title: text(),
			design_quality: select({ options: QUALITY_OPTIONS }),
			added_at: date(),
		},
		github_repos: {
			id: id(),
			url: text(),
			title: text(),
			description: text({ nullable: true }),
			content: text(),
			readme_quality: select({ options: QUALITY_OPTIONS, nullable: true }),
			impact: select({ options: QUALITY_OPTIONS, nullable: true }),
			hacker_news_url: text({ nullable: true }),
			added_at: date(),
		},
		doc_sites: {
			id: id(),
			url: text(),
			title: text(),
			quality: select({ options: QUALITY_OPTIONS }),
			added_at: date(),
		},
		article_excerpts: {
			id: id(),
			article_id: text(),
			content: text(),
			comment: text({ nullable: true }),
			created_at: date(),
			updated_at: date(),
		},
		essays: {
			id: id(),
			title: text(),
			author: text(),
			content: text(),
			quality: select({ options: QUALITY_OPTIONS }),
			added_at: date(),
		},
		essay_excerpts: {
			id: id(),
			essay_id: text(),
			content: text(),
			comment: text({ nullable: true }),
			created_at: date(),
			updated_at: date(),
		},
		books: {
			id: id(),
			title: text(),
			author: text(),
			added_at: date(),
			read_at: date({ nullable: true }),
		},
		book_excerpts: {
			id: id(),
			book_id: text(),
			content: text(),
			comment: text({ nullable: true }),
			created_at: date(),
			updated_at: date(),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) =>
			markdownIndex(c, {
				tableConfigs: {
					articles: {
						serialize: ({ row: { content, id, ...row } }) => {
							// Strip null values for cleaner YAML
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

							// Stripped null values from serialize are restored via .default(null)
							const FrontMatter = table.validators
								.toArktype()
								.omit('id', 'content');
							const parsed = FrontMatter(frontmatter);

							if (parsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for row ${rowId}`,
									context: {
										fileName: filename,
										id: rowId,
										reason: parsed.summary,
									},
								});
							}

							const row = {
								id: rowId,
								content: body,
								...parsed,
							} satisfies SerializedRow<typeof table.schema>;

							return Ok(row);
						},
					},
					github_repos: {
						serialize: ({ row: { content, id, ...row } }) => {
							// Strip null values for cleaner YAML
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

							// Stripped null values from serialize are restored via .default(null)
							const FrontMatter = table.validators
								.toArktype()
								.omit('id', 'content');
							const parsed = FrontMatter(frontmatter);

							if (parsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for row ${rowId}`,
									context: {
										fileName: filename,
										id: rowId,
										reason: parsed.summary,
									},
								});
							}

							const row = {
								id: rowId,
								content: body,
								...parsed,
							} satisfies SerializedRow<typeof table.schema>;

							return Ok(row);
						},
					},
					article_excerpts: {
						serialize: ({ row: { content, id, ...row } }) => {
							// Strip null values for cleaner YAML
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

							// Stripped null values from serialize are restored via .default(null)
							const FrontMatter = table.validators
								.toArktype()
								.omit('id', 'content');
							const parsed = FrontMatter(frontmatter);

							if (parsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for row ${rowId}`,
									context: {
										fileName: filename,
										id: rowId,
										reason: parsed.summary,
									},
								});
							}

							const row = {
								id: rowId,
								content: body,
								...parsed,
							} satisfies SerializedRow<typeof table.schema>;

							return Ok(row);
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		...db,
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,

		/**
		 * Add a clipping from a URL
		 *
		 * Fetches the URL using JSDOM, extracts content using Defuddle, and saves it as a clipping.
		 * Uses JSDOM for efficient single-pass parsing and better URL handling.
		 */
		addFromUrl: defineMutation({
			input: type({
				url: 'string',
				'quality?': type.enumerated(...QUALITY_OPTIONS),
				'hacker_news_url?': 'string',
			}),
			handler: async ({ url, quality, hacker_news_url }) => {
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
				db.articles.insert({
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
					word_count: result.wordCount,
					quality: quality ?? null,
					hacker_news_url: hacker_news_url ?? null,
					saved_at: now,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Remove duplicate articles
		 *
		 * Compares articles by URL and keeps only the most recently saved version.
		 * Deletes older duplicates based on saved_at timestamp.
		 */
		removeDuplicates: defineMutation({
			handler: () => {
				type Article = typeof db.articles.$inferSerializedRow;

				// Convert rows to JSON
				const articles: Article[] = db.articles
					.getAll()
					.map((row) => row.toJSON());

				// Group by URL
				const urlMap = new Map<string, Article[]>();
				for (const article of articles) {
					if (!urlMap.has(article.url)) {
						urlMap.set(article.url, []);
					}
					urlMap.get(article.url)?.push(article);
				}

				// Collect IDs to delete (keep only the most recent for each URL)
				const idsToDelete = Array.from(urlMap.values()).flatMap(
					(duplicates) => {
						if (duplicates.length <= 1) {
							return [];
						}

						// Find the most recent article
						const newest = duplicates.reduce((max, current) => {
							const maxTime = DateWithTimezoneFromString(
								max.saved_at,
							).date.getTime();
							const currentTime = DateWithTimezoneFromString(
								current.saved_at,
							).date.getTime();
							return currentTime > maxTime ? current : max;
						});

						// Return IDs of all others
						return duplicates
							.filter((article) => article.id !== newest.id)
							.map((article) => article.id);
					},
				);

				// Delete all duplicates in one batch operation
				db.articles.deleteMany({ ids: idsToDelete });

				return Ok({ deletedCount: idsToDelete.length });
			},
		}),

		/**
		 * Add a landing page
		 */
		addLandingPage: defineMutation({
			input: type({
				url: 'string',
				title: 'string',
				design_quality: type.enumerated(...QUALITY_OPTIONS),
			}),
			handler: async ({ url, title, design_quality }) => {
				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				db.landing_pages.insert({
					id: generateId(),
					url,
					title,
					design_quality,
					added_at: now,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Add a GitHub repository
		 *
		 * Fetches the GitHub repo page, extracts the README content using Defuddle,
		 * and stores it with your quality ratings.
		 */
		addGitHubRepo: defineMutation({
			input: type({
				url: 'string',
				'readme_quality?': type.enumerated(...QUALITY_OPTIONS),
				'impact?': type.enumerated(...QUALITY_OPTIONS),
				title: 'string | null',
				description: 'string | null',
				'hacker_news_url?': 'string',
			}),
			handler: async ({
				url,
				readme_quality,
				impact,
				title,
				description,
				hacker_news_url,
			}) => {
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

				db.github_repos.insert({
					id: generateId(),
					url,
					title: finalTitle,
					description: description || result.description || null,
					content: result.content,
					readme_quality: readme_quality ?? null,
					impact: impact ?? null,
					hacker_news_url: hacker_news_url ?? null,
					added_at: now,
				});

				return Ok(undefined);
			},
		}),

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

				db.doc_sites.insert({
					id: generateId(),
					url,
					title,
					quality,
					added_at: now,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Add a book
		 *
		 * Creates a new book entry. Returns the book ID for use with addBookClipping.
		 */
		addBook: defineMutation({
			input: db.books.validators.toArktype().pick('title', 'author', 'read_at'),
			handler: ({ title, author, read_at }) => {
				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				const book_id = generateId();

				db.books.insert({
					id: book_id,
					title,
					author,
					added_at: now,
					read_at: read_at ?? null,
				});

				return Ok({ book_id });
			},
		}),

		/**
		 * Add an excerpt from a book
		 *
		 * Creates a new excerpt associated with an existing book.
		 */
		addBookExcerpt: defineMutation({
			input: db.book_excerpts.validators
				.toArktype()
				.pick('book_id', 'content', 'comment'),
			handler: ({ book_id, content, comment }) => {
				// Verify the book exists
				const book = db.books.get(book_id);
				if (!book) {
					return Err({
						message: 'Book not found',
						context: { book_id },
					});
				}

				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				db.book_excerpts.insert({
					id: generateId(),
					book_id,
					content,
					comment: comment ?? null,
					created_at: now,
					updated_at: now,
				});

				return Ok(undefined);
			},
		}),

		/**
		 * Add an excerpt from an article
		 *
		 * Creates a new excerpt associated with an existing article.
		 */
		addArticleExcerpt: defineMutation({
			input: db.article_excerpts.validators
				.toArktype()
				.pick('article_id', 'content', 'comment'),
			handler: ({ article_id, content, comment }) => {
				// Verify the article exists
				const article = db.articles.get({ id: article_id });
				if (!article) {
					return Err({
						message: 'Article not found',
						context: { article_id },
					});
				}

				const now = DateWithTimezone({
					date: new Date(),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				}).toJSON();

				db.article_excerpts.insert({
					id: generateId(),
					article_id,
					content,
					comment: comment ?? null,
					created_at: now,
					updated_at: now,
				});

				return Ok(undefined);
			},
		}),
	}),
});
