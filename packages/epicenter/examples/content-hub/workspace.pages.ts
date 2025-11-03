import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import { setupPersistence } from '../../src/core/workspace/providers/persistence/desktop';
import {
	defineMutation,
	defineQuery,
	defineWorkspace,
	eq,
	generateId,
	id,
	select,
	sqliteIndex,
	text,
} from '../../src/index';

/**
 * Pages workspace
 * Manages page content (blogs, articles, guides, tutorials, news)
 */
export const pages = defineWorkspace({
	id: 'pages',
	version: 1,

	schema: {
		pages: {
			id: id(),
			title: text(),
			content: text(),
			type: select({
				options: ['blog', 'article', 'guide', 'tutorial', 'news'],
			}),
			tags: select({
				options: [
					'tech',
					'lifestyle',
					'business',
					'education',
					'entertainment',
				],
			}),
		},
	},

	indexes: {
		sqlite: (db) =>
			sqliteIndex(db, {
				path: path.join('.epicenter', 'pages.db'),
			}),
	},

	providers: [
		setupPersistence({
			storagePath: './.epicenter',
		}),
	],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all pages
		 */
		getPages: defineQuery({
			handler: async () => {
				const pages = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.pages);
				return Ok(pages);
			},
		}),

		/**
		 * Get page by ID
		 */
		getPage: defineQuery({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				const page = await indexes.sqlite.db
					.select()
					.from(indexes.sqlite.pages)
					.where(eq(indexes.sqlite.pages.id, id));
				return Ok(page[0] ?? null);
			},
		}),

		/**
		 * Create a page
		 */
		createPage: defineMutation({
			input: type({
				title: 'string',
				content: 'string',
				type: "'blog' | 'article' | 'guide' | 'tutorial' | 'news'",
				tags: "'tech' | 'lifestyle' | 'business' | 'education' | 'entertainment'",
			}),
			handler: async (data) => {
				const page = {
					id: generateId(),
					...data,
				};
				db.tables.pages.insert(page);
				return Ok(page);
			},
		}),

		/**
		 * Update a page
		 */
		updatePage: defineMutation({
			input: type({
				id: 'string',
				'title?': 'string',
				'content?': 'string',
				'type?': "'blog' | 'article' | 'guide' | 'tutorial' | 'news'",
				'tags?':
					"'tech' | 'lifestyle' | 'business' | 'education' | 'entertainment'",
			}),
			handler: async ({ id, ...fields }) => {
				db.tables.pages.update({ id, ...fields });
				const { row } = db.tables.pages.get(id);
				return Ok(row);
			},
		}),

		/**
		 * Delete a page
		 */
		deletePage: defineMutation({
			input: type({ id: 'string' }),
			handler: async ({ id }) => {
				db.tables.pages.delete(id);
				return Ok({ id });
			},
		}),
	}),
});
