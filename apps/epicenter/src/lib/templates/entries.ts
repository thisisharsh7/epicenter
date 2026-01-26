/**
 * Entries workspace template.
 *
 * A general-purpose content management schema with:
 * - id: unique identifier
 * - title: entry title
 * - content: entry body text
 * - type: categorization tags
 * - tags: additional tagging
 */

import { id, table, tags, text } from '@epicenter/hq';

export const ENTRIES_TEMPLATE = {
	id: 'epicenter.entries',
	name: 'Entries',
	tables: {
		entries: table({
			name: 'Entries',
			icon: '📝',
			description: 'General-purpose content entries',
			fields: {
				id: id(),
				title: text({ name: 'Title', description: 'Entry title' }),
				content: text({ name: 'Content', description: 'Entry body text' }),
				type: tags({ name: 'Type', description: 'Entry type/category' }),
				tags: tags({ name: 'Tags', description: 'Additional tags' }),
			},
		}),
	},
	kv: {},
} as const;
