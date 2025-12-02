import {
	date,
	defineWorkspace,
	id,
	markdownIndex,
	sqliteIndex,
	tags,
	text,
	withBodyField,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';

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
 * Wiki entries can link to each other using standard markdown links.
 * Each entry represents your authoritative take on a topic.
 */
export const wiki = defineWorkspace({
	id: 'wiki',

	schema: {
		entries: {
			id: id(),
			title: text(),
			content: text(),
			summary: text({ nullable: true }),
			tags: tags({ nullable: true }),
			created_at: date(),
			updated_at: date(),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) =>
			markdownIndex(c, {
				tableConfigs: {
					entries: withBodyField('content'),
				},
			}),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		...db.entries,
		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
