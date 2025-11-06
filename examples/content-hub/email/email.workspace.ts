import path from 'node:path';
import {
	type SerializedRow,
	date,
	defineWorkspace,
	id,
	isDateWithTimezoneString,
	markdownIndex,
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
			date: date(),
			createdAt: date(),
			updatedAt: date(),
		},
	},

	indexes: {
		sqlite: sqliteIndex,
		markdown: ({ id, db }) =>
			markdownIndex({
				id,
				db,
				storagePath: process.env.EPICENTER_ROOT_DIR
					? path.join(process.env.EPICENTER_ROOT_DIR, id)
					: `./${id}`,
				serializers: {
					emails: {
						serialize: ({ row: { body, ...row } }) => ({
							frontmatter: row,
							body,
						}),
						deserialize: ({ id, frontmatter, body, filePath, schema }) => {
							const FrontMatter = type({
								subject: 'string',
								date: type.string.filter(isDateWithTimezoneString),
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
								body,
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
