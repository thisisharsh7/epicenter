import { basename } from 'node:path';
import {
	type SerializedRow,
	date,
	defineWorkspace,
	id,
	markdownIndex,
	select,
	sqliteIndex,
	tags,
	text,
} from '@epicenter/hq';
import { MarkdownIndexErr } from '@epicenter/hq/indexes/markdown';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';

/**
 * Journal workspace
 * Manages personal journal entries with temporal and reflective metadata
 */
export const journal = defineWorkspace({
	id: 'journal',

	schema: {
		journal: {
			// Core fields
			id: id(),
			title: text(),
			content: text(),

			// Timestamps with timezone support
			date: date(),
			timezone: text(),
			created_at: date({ nullable: true }),
			updated_at: date({ nullable: true }),

			// Categorization
			journal_type: select({
				options: ['family', 'friends', 'personal'],
				nullable: true,
			}),

			type: tags({
				nullable: true,
			}),

			tags: tags({
				nullable: true,
			}),

			// Emotional/reflective metadata
			mood: select({
				options: [
					'joyful',
					'content',
					'contemplative',
					'neutral',
					'melancholic',
					'frustrated',
					'anxious',
				],
				nullable: true,
			}),

			resonance: select({
				options: [
					'High',
					'Medium',
					'Moderate',
					'Mild',
					'Low',
					'Profound',
					'Transformative',
					'Extreme',
				],
				nullable: true,
			}),

			// Context
			location: text({ nullable: true }),

			// Meal tracking
			meal: select({
				options: ['breakfast', 'lunch', 'dinner', 'snack'],
				nullable: true,
			}),

			// Workflow/publishing fields (from migration)
			subtitle: text({ nullable: true }),
			alias: tags({ nullable: true }), // Array of alternative titles
			status: select({
				options: [
					'Done',
					'Needs Scaffolding',
					'Needs Polishing',
					'Imported from Todoist',
					'Draft',
					'Backlog',
				],
				nullable: true,
			}),
			visibility: select({
				options: ['Family', 'Public', 'Private'],
				nullable: true,
			}),
		},
	},

	indexes: {
		sqlite: (c) => sqliteIndex(c),
		markdown: (c) =>
			markdownIndex(c, {
				tableConfigs: {
					journal: {
						serialize: ({ row: { content, id, ...row } }) => {
							// Sort keys alphabetically (keep null values for proper round-trip)
							const entries = Object.entries(row).sort(([a], [b]) =>
								a.localeCompare(b),
							);
							const frontmatter = Object.fromEntries(entries);
							return {
								frontmatter,
								body: content,
								filename: `${id}.md`,
							};
						},
						deserialize: ({ frontmatter, body, filename, table }) => {
							// Extract ID from filename
							const id = basename(filename, '.md');

							// Validate frontmatter (omit id and content)
							// Nullable fields automatically default to null, required fields must be present
							const FrontMatter = table.validators
								.toArktype()
								.omit('id', 'content');
							const parsed = FrontMatter(frontmatter);

							if (parsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for row ${id}`,
									context: {
										fileName: filename,
										id,
										reason: parsed.summary,
									},
								});
							}

							// Build row by spreading validated frontmatter
							// Missing nullable fields are already null, required fields were validated
							const row = {
								id,
								content: body,
								...parsed,
							} satisfies SerializedRow<typeof table.schema>;

							return Ok(row);
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	exports: ({ db, validators, indexes }) => ({
		/**
		 * Direct access to database operations
		 */
		db,

		/**
		 * Schema validators for runtime validation and arktype composition.
		 *
		 * Use validators for:
		 * - Migration scripts that validate external data
		 * - Custom deserialization logic
		 * - Composing arktype schemas with `.omit()`, `.partial()`, etc.
		 *
		 * @example
		 * ```typescript
		 * // Validate frontmatter (exclude auto-managed fields)
		 * const FrontMatter = validators.journal.toArktype().omit('id', 'content');
		 * const result = FrontMatter(unknownData);
		 * if (result instanceof type.errors) {
		 *   // Handle validation error
		 * }
		 * ```
		 */
		validators,

		/**
		 * Get all journal entries
		 */
		getJournalEntries: db.journal.getAll,

		/**
		 * Get a journal entry by ID
		 */
		getJournalEntry: db.journal.get,

		/**
		 * Create a journal entry
		 */
		createJournalEntry: db.journal.insert,

		/**
		 * Update a journal entry
		 */
		updateJournalEntry: db.journal.update,

		/**
		 * Delete a journal entry
		 */
		deleteJournalEntry: db.journal.delete,

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
