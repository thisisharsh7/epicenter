import {
	date,
	defineWorkspace,
	id,
	markdownIndex,
	select,
	sqliteIndex,
	tags,
	text
} from '@epicenter/hq';
import { MarkdownIndexErr } from '@epicenter/hq/indexes/markdown';
import { setupPersistence } from '@epicenter/hq/providers';
import { type } from 'arktype';
import { basename } from 'node:path';
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
							const entries = Object.entries(row)
								.sort(([a], [b]) => a.localeCompare(b));
							const frontmatter = Object.fromEntries(entries);
							return {
								frontmatter,
								body: content,
								filename: `${id}.md`,
							};
						},
						deserialize: ({ frontmatter, body, filename, table }) => {
							// Fields that are handled separately (not in frontmatter)
							const OMITTED_FROM_FRONTMATTER = ['id', 'content'] as const;

							// Extract ID from filename
							const id = basename(filename, '.md');

							// Validate frontmatter first (omit id and content)
							const FrontMatter = table.validators.toArktype().omit(...OMITTED_FROM_FRONTMATTER);
							const frontmatterParsed = FrontMatter(frontmatter);
							if (frontmatterParsed instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid frontmatter for row ${id}`,
									context: {
										fileName: filename,
										id,
										reason: frontmatterParsed.summary,
									},
								});
							}

							// Build row dynamically from schema, ensuring all fields are present
							const rowData = {
								id,
								content: body,
								...Object.fromEntries(
									Object.entries(table.schema)
										.map(([key, columnSchema]) => {
											// Skip fields that are handled separately
											if (OMITTED_FROM_FRONTMATTER.includes(key as any)) return null;

											const frontmatterValue = frontmatterParsed[key as keyof typeof frontmatterParsed];

											// Field exists in frontmatter
											if (key in frontmatterParsed) {
												const value = columnSchema.nullable ? (frontmatterValue ?? null) : frontmatterValue;
												return [key, value] as const
											}

											// Field doesn't exist, but it's nullable - set to null
											if (columnSchema.nullable) {
												return [key, null] as const
											}

											// Required field is missing - exclude from object so validation fails with clear error
											return null;
										})
										.filter((entry) => entry !== null),
								),
							};

							// Validate the final row BEFORE returning to ensure correctness
							const RowValidator = table.validators.toArktype();
							const row = RowValidator(rowData);

							if (row instanceof type.errors) {
								return MarkdownIndexErr({
									message: `Invalid row data after construction for ${id}`,
									context: {
										fileName: filename,
										id,
										reason: row.summary,
									},
								});
							}

							return Ok(row);
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	exports: ({ db, indexes }) => ({
		/**
		 * Direct access to database operations and validators
		 */
		db,

		/**
		 * Get all journal entries
		 */
		getJournalEntries: db.tables.journal.getAll,

		/**
		 * Get a journal entry by ID
		 */
		getJournalEntry: db.tables.journal.get,

		/**
		 * Create a journal entry
		 */
		createJournalEntry: db.tables.journal.insert,

		/**
		 * Update a journal entry
		 */
		updateJournalEntry: db.tables.journal.update,

		/**
		 * Delete a journal entry
		 */
		deleteJournalEntry: db.tables.journal.delete,

		pullToMarkdown: indexes.markdown.pullToMarkdown,
		pushFromMarkdown: indexes.markdown.pushFromMarkdown,
		pullToSqlite: indexes.sqlite.pullToSqlite,
		pushFromSqlite: indexes.sqlite.pushFromSqlite,
	}),
});
