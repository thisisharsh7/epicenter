import path from 'node:path';
import {
	type SerializedRow,
	date,
	defineWorkspace,
	id,
	isDateWithTimezoneString,
	markdownIndex,
	tags,
	sqliteIndex,
	text,
} from '@epicenter/hq';
import { MarkdownIndexErr } from '@epicenter/hq/indexes/markdown';
import { setupPersistence } from '@epicenter/hq/providers';
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

	schema: {
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
			createdAt: date(),
			updatedAt: date(),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) =>
			markdownIndex(c, {
				tableConfigs: {
					emails: {
						serialize: ({ row: { body, id, ...row }, table }) => ({
							frontmatter: row,
							body,
							filename: `${id}.md`,
						}),
						deserialize: ({ frontmatter, body, filename, table }) => {
							const id = path.basename(filename, '.md');

							const FrontMatter = table.validators.toArktype().omit('id', 'body');
							const frontmatterParsed = FrontMatter(frontmatter);
							if (frontmatterParsed instanceof type.errors) {
								return MarkdownIndexErr({
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
								createdAt: frontmatterParsed.createdAt,
								updatedAt: frontmatterParsed.updatedAt,
							} satisfies SerializedRow<(typeof c.db.schema)['emails']>;
							return Ok(row);
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		/**
		 * Get all emails
		 *
		 * We can pass `db.tables.emails.getAll` directly as an action because it's already
		 * a Query that returns the correct type. The table helper is pre-typed and pre-annotated
		 * with all the metadata needed by Epicenter's action system, so there's no need to
		 * wrap it with `defineQuery()`. Think of table helpers as pre-built, ready-to-use
		 * query/mutation implementations.
		 */
		getEmails: db.tables.emails.getAll,

		/**
		 * Get a specific email by ID
		 *
		 * Same pattern as getEmails: `db.tables.emails.get` is already properly typed as a
		 * Query<{ id: string }> that returns a single row. The table helper handles the
		 * input validation and ID lookup automatically.
		 */
		getEmail: db.tables.emails.get,

		/**
		 * Create a new email
		 *
		 * `db.tables.emails.insert` is already a Mutation that accepts a complete row object
		 * and inserts it into the table. No need to manually wrap it with `defineMutation()`.
		 *
		 * NOTE: This approach doesn't auto-generate IDs or timestamps. If you need those,
		 * you'd keep a custom mutation like we did in other examples. But for this simple
		 * email workspace, the caller provides all values including the ID.
		 */
		createEmail: db.tables.emails.insert,

		/**
		 * Update email fields
		 *
		 * `db.tables.emails.update` is a pre-built Mutation that handles partial updates.
		 * It accepts an object with an `id` and any fields you want to update. No timestamp
		 * management happens automatically here, but that's fine for this use case.
		 */
		updateEmail: db.tables.emails.update,

		/**
		 * Delete an email
		 *
		 * `db.tables.emails.delete` is a Mutation that removes a row by ID. Already properly
		 * typed and annotated, ready to use as an action.
		 */
		deleteEmail: db.tables.emails.delete,

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
