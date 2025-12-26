import { date, defineWorkspace, id, select, tags, text } from '@epicenter/hq';
import {
	bodyFieldSerializer,
	markdownProvider,
} from '@epicenter/hq/providers/markdown';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';

/**
 * Journal workspace
 * Manages personal journal entries with temporal and reflective metadata
 */
export const journal = defineWorkspace({
	id: 'journal',

	tables: {
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

	providers: {
		persistence: setupPersistence,
		sqlite: (c) => sqliteProvider(c),
		markdown: (c) =>
			markdownProvider(c, {
				tableConfigs: {
					// Keep null values for proper round-trip (no stripping)
					journal: {
						serializer: bodyFieldSerializer('content', { stripNulls: false }),
					},
				},
			}),
	},

	exports: ({ tables, providers }) => ({
		...tables.journal,
		pullToMarkdown: providers.markdown.pullToMarkdown,
		pushFromMarkdown: providers.markdown.pushFromMarkdown,
		pullToSqlite: providers.sqlite.pullToSqlite,
		pushFromSqlite: providers.sqlite.pushFromSqlite,
	}),
});
