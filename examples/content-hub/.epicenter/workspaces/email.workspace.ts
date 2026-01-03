import {
	date,
	defineWorkspace,
	id,
	tags,
	text,
} from '@epicenter/hq';
import {
	bodyFieldSerializer,
	markdownProvider,
} from '@epicenter/hq/providers/markdown';
import { setupPersistence } from '@epicenter/hq/providers/persistence';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';

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
					emails: { serializer: bodyFieldSerializer('body') },
				},
			}),
	},

	actions: ({ providers }) => ({
		pullToMarkdown: providers.markdown.pullToMarkdown,
		pushFromMarkdown: providers.markdown.pushFromMarkdown,
		pullToSqlite: providers.sqlite.pullToSqlite,
		pushFromSqlite: providers.sqlite.pushFromSqlite,
	}),
});
