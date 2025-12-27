import path from 'node:path';
import {
	date,
	defineWorkspace,
	id,
	type SerializedRow,
	tags,
	text,
} from '@epicenter/hq';
import {
	MarkdownProviderErr,
	markdownProvider,
} from '@epicenter/hq/providers/markdown';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

/**
 * Email workspace
 *
 * Manages email messages with subject, body, and date tracking.
 * Stores email records for archival and reference purposes.
 */
export const email = defineWorkspace({
	id: 'email',

	tables: {
		emails: {
			id: id(),
			subject: text(),
			body: text(),
			description: text({ nullable: true }),
			tags: tags({
				options: [
					'Announcement',
					'Auditing',
					'Cambridge',
					'Cancellation',
					'Chinese',
					'Classes',
					'Courses',
					'Foreign Policy',
					'Gap',
					'Gapping',
					'Journal',
					'Leave of Absence',
					'Light Fellowship',
					'Project',
					'Request',
					'Superlatives',
					'Yale',
				],
				nullable: true,
			}),
			date: date(),
			created_at: date(),
			updated_at: date(),
		},
	},

	providers: {
		persistence: setupPersistence,
		sqlite: (c) => sqliteProvider(c),
		markdown: (c) =>
			markdownProvider(c, {
				tableConfigs: {
					emails: {
						serialize: ({ row: { body, id, ...row } }) => ({
							frontmatter: row,
							body,
							filename: `${id}.md`,
						}),
						deserialize: ({ frontmatter, body, filename, table }) => {
							const id = path.basename(filename, '.md');

							const FrontMatter = table.validators
								.toArktype()
								.omit('id', 'body');
							const frontmatterParsed = FrontMatter(frontmatter);
							if (frontmatterParsed instanceof type.errors) {
								return MarkdownProviderErr({
									message: `Invalid frontmatter for row ${id}`,
									context: {
										fileName: filename,
										id,
										reason: frontmatterParsed,
									},
								});
							}
							const row = {
								id,
								body,
								description: frontmatterParsed.description ?? null,
								tags: frontmatterParsed.tags ?? null,
								subject: frontmatterParsed.subject,
								date: frontmatterParsed.date,
								created_at: frontmatterParsed.created_at,
								updated_at: frontmatterParsed.updated_at,
							} satisfies SerializedRow<typeof table.schema>;
							return Ok(row);
						},
						extractRowIdFromFilename: (filename) =>
							path.basename(filename, '.md'),
					},
				},
			}),
	},

	actions: ({ tables, providers }) => ({
		...tables.emails,
		pullToMarkdown: providers.markdown.pullToMarkdown,
		pushFromMarkdown: providers.markdown.pushFromMarkdown,
		pullToSqlite: providers.sqlite.pullToSqlite,
		pushFromSqlite: providers.sqlite.pushFromSqlite,
	}),
});
