/**
 * Whispering workspace template.
 *
 * Mirrors the core recording schema used by Epicenter Whispering so that
 * recordings and transcriptions can be shared across apps via a unified
 * Epicenter workspace.
 */

import { id, select, table, text } from '@epicenter/hq';

export const WHISPERING_TEMPLATE = {
	id: 'epicenter.whispering',
	name: 'Whispering',
	tables: {
		recordings: table({
			name: 'Recordings',
			icon: '🎙️',
			description: 'Voice recordings and transcriptions',
			fields: {
				id: id(),
				title: text({ name: 'Title' }),
				subtitle: text({ name: 'Subtitle' }),
				timestamp: text({ name: 'Timestamp' }),
				createdAt: text({ name: 'Created At' }),
				updatedAt: text({ name: 'Updated At' }),
				transcribedText: text({ name: 'Transcribed Text' }),
				transcriptionStatus: select({
					name: 'Status',
					options: ['UNPROCESSED', 'TRANSCRIBING', 'DONE', 'FAILED'],
				}),
			},
		}),
	},
	kv: {},
} as const;
