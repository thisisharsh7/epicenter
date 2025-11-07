import {
	type SerializedRow,
	date,
	defineWorkspace,
	id,
	isDateWithTimezoneString,
	markdownIndex,
	select,
	text,
} from '@epicenter/hq';
import { MarkdownIndexErr } from '@epicenter/hq/indexes/markdown';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

/**
 * Epicenter workspace
 *
 * Manages company-related content including pitches and strategic documents.
 * Tracks pitch iterations and versions for the Epicenter company.
 */
export const epicenter = defineWorkspace({
	id: 'epicenter',

	schema: {
		pitches: {
			id: id(),
			title: text(),
			content: text(),
			rating: select({ options: ['decent', 'good', 'great', 'excellent'] }),
			createdAt: date(),
			updatedAt: date(),
		},
	},

	indexes: {
		markdown: (c) =>
			markdownIndex(c, {
				serializers: {
					pitches: {
						serialize: ({ row: { content, ...row } }) => ({
							frontmatter: row,
							body: content,
						}),
						deserialize: ({ id, frontmatter, body, filePath, schema }) => {
							const FrontMatter = type({
								title: 'string',
								rating: '"decent" | "good" | "great" | "excellent"',
								createdAt: type.string.filter(isDateWithTimezoneString),
								updatedAt: type.string.filter(isDateWithTimezoneString),
							});
							const frontmatterParsed = FrontMatter(frontmatter);
							if (frontmatterParsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for row ${id}`,
									context: { filePath, id, reason: frontmatterParsed },
								});
							}
							const row = {
								id,
								content: body,
								...frontmatterParsed,
							} satisfies SerializedRow<typeof schema>;
							return Ok(row);
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => ({
		/**
		 * Get all pitches
		 */
		getPitches: db.tables.pitches.getAll,

		/**
		 * Get a specific pitch by ID
		 */
		getPitch: db.tables.pitches.get,

		/**
		 * Create a new pitch
		 */
		createPitch: db.tables.pitches.insert,

		/**
		 * Update pitch fields
		 */
		updatePitch: db.tables.pitches.update,

		/**
		 * Delete a pitch
		 */
		deletePitch: db.tables.pitches.delete,

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
	}),
});
