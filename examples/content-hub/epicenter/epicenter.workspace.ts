import path from 'node:path';
import {
	date,
	defineWorkspace,
	id,
	markdownProvider,
	type SerializedRow,
	select,
	text,
} from '@epicenter/hq';
import { MarkdownProviderErr } from '@epicenter/hq/indexes/markdown';
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

	tables: {
		pitches: {
			id: id(),
			slug: text(),
			title: text(),
			content: text(),
			rating: select({ options: ['decent', 'good', 'great', 'excellent'] }),
			created_at: date(),
			updated_at: date(),
		},
	},

	providers: {
		persistence: setupPersistence,
		markdown: (c) =>
			markdownProvider(c, {
				tableConfigs: {
					pitches: {
						serialize: ({ row: { content, slug, ...row }, table }) => ({
							frontmatter: row,
							body: content,
							filename: `${slug}.md`,
						}),
						deserialize: ({ frontmatter, body, filename, table }) => {
							const slug = path.basename(filename, '.md');
							const FrontMatter = table.validators
								.toArktype()
								.omit('content', 'slug');
							const frontmatterParsed = FrontMatter(frontmatter);
							if (frontmatterParsed instanceof type.errors) {
								return MarkdownProviderErr({
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

	exports: ({ tables, providers }) => ({
		...tables.pitches,
		pullToMarkdown: providers.markdown.pullToMarkdown,
		pushFromMarkdown: providers.markdown.pushFromMarkdown,
	}),
});
