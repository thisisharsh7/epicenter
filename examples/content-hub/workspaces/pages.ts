import path from 'node:path';
import {
	defineWorkspace,
	id,
	markdownIndex,
	select,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';

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
		sqlite: (c) => sqliteIndex(c),
		markdown: ({ id, db }) =>
			markdownIndex({
				id,
				db,
				storagePath: process.env.EPICENTER_ROOT_PATH
					? path.join(process.env.EPICENTER_ROOT_PATH, id)
					: `./${id}`,
			}),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all pages
		 *
		 * `db.tables.pages.getAll` is a pre-built Query action. No wrapper needed because
		 * Epicenter already knows how to handle table operations as first-class actions.
		 * The table helper returns Query<> which is exactly what the actions object expects.
		 */
		getPages: db.tables.pages.getAll,

		/**
		 * Get a page by ID
		 *
		 * Direct assignment of `db.tables.pages.get`. The table helper is already typed
		 * as Query<{ id: string }, PageRow | null>, so we don't need to define input types.
		 */
		getPage: db.tables.pages.get,

		/**
		 * Create a page
		 *
		 * Why can we just use `db.tables.pages.insert` directly?
		 *
		 * 1. The table helper is already a Mutation<void, RowAlreadyExistsError>
		 * 2. Input validation happens via the table's schema types
		 * 3. No custom business logic needed (no timestamps, auto-IDs, validation)
		 *
		 * This is the "just use what Epicenter provides" approach. If you need:
		 * - Auto-generated IDs: keep a custom mutation
		 * - Timestamps (createdAt, updatedAt): keep a custom mutation
		 * - Complex validation: keep a custom mutation
		 *
		 * But for straightforward insert operations, the table helper is perfect.
		 */
		createPage: db.tables.pages.insert,

		/**
		 * Update a page
		 *
		 * Same reasoning as createPage: the table helper handles partial updates correctly.
		 * We don't need timestamp management for this workspace, so we can use it directly.
		 */
		updatePage: db.tables.pages.update,

		/**
		 * Delete a page
		 *
		 * `db.tables.pages.delete` is already a Mutation<void, never> (never fails),
		 * so it's safe to use directly.
		 */
		deletePage: db.tables.pages.delete,

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
