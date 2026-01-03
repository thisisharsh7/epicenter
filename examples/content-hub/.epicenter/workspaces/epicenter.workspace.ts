import path from 'node:path';
import {
	date,
	defineWorkspace,
	id,
	type SerializedRow,
	select,
	text,
} from '@epicenter/hq';
import {
	defineSerializer,
	MarkdownProviderErr,
	markdownProvider,
} from '@epicenter/hq/providers/markdown';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
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
						/**
						 * Custom serializer using slug-based filenames.
						 *
						 * NOTE: ID is stored in frontmatter, not filename.
						 * File deletion sync won't work correctly since the provider
						 * can't map filename → row ID. Use push/pull actions instead.
						 */
						serializer: defineSerializer<(typeof epicenter)['schema']['pitches']>()
							.parseFilename((filename) => {
								const slug = path.basename(filename, '.md');
								return { id: slug, slug };
							})
							.serialize(({ row: { content, slug, ...rest } }) => ({
								frontmatter: rest,
								body: content,
								filename: `${slug}.md`,
							}))
							.deserialize(({ frontmatter, body, parsed, table }) => {
								const { slug } = parsed;
								const FrontMatter = table.validators
									.toArktype()
									.omit('content', 'slug');
								const frontmatterParsed = FrontMatter(frontmatter);
								if (frontmatterParsed instanceof type.errors) {
									return MarkdownProviderErr({
										message: `Invalid frontmatter for pitch with slug ${slug}`,
										context: {
											fileName: `${slug}.md`,
											id: slug,
											reason: frontmatterParsed.summary,
										},
									});
								}
								const row = {
									slug,
									content: body,
									...frontmatterParsed,
								} satisfies SerializedRow<typeof table.schema>;
								return Ok(row);
							}),
					},
				},
			}),
	},

	actions: ({ providers }) => ({
		pullToMarkdown: providers.markdown.pullToMarkdown,
		pushFromMarkdown: providers.markdown.pushFromMarkdown,
	}),
});
