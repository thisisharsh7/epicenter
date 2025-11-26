import path from 'node:path';
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
			slug: text(),
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
				tableConfigs: {
					pitches: {
						serialize: ({ row: { content, slug, ...row }, table }) => ({
							frontmatter: row,
							body: content,
							filename: `${slug}.md`,
						}),
						deserialize: ({ frontmatter, body, filename, table }) => {
							const slug = path.basename(filename, '.md');
							const FrontMatter = table.$validators
								.toArktype()
								.omit('content', 'slug');
							const frontmatterParsed = FrontMatter(frontmatter);
							if (frontmatterParsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for pitch with slug ${slug}`,
									context: {
										filename,
										slug,
										reason: frontmatterParsed,
									},
								});
							}
							const row = {
								slug,
								content: body,
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
		 * Get all pitches
		 */
		getPitches: db.pitches.getAll,

		/**
		 * Get a specific pitch by ID
		 */
		getPitch: db.pitches.get,

		/**
		 * Create a new pitch
		 */
		createPitch: db.pitches.insert,

		/**
		 * Update pitch fields
		 */
		updatePitch: db.pitches.update,

		/**
		 * Delete a pitch
		 */
		deletePitch: db.pitches.delete,

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
	}),
});
