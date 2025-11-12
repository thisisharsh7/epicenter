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
import { setupPersistence } from '@epicenter/hq/providers';

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
					'Mild',
					'Low',
					'Profound',
					'Transformative',
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
							// Remove null values and sort keys alphabetically
							const entries = Object.entries(row)
								.filter(([_, value]) => value !== null)
								.sort(([a], [b]) => a.localeCompare(b));
							const frontmatter = Object.fromEntries(entries);
							return {
								frontmatter,
								body: content,
								filename: `${id}.md`,
							};
						},
					},
				},
			}),
	},

	providers: [setupPersistence],

	actions: ({ db, indexes }) => {
		return {
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
		};
	},
});
