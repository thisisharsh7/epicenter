/**
 * Browser state schema composition.
 *
 * Used by the background workspace for server sync and persistence.
 * The popup reads directly from Chrome APIs, not from Y.Doc.
 */

import type { ExtractTablesSchema, Tables } from '@epicenter/hq';
import {
	DEVICES_SCHEMA,
	TAB_GROUPS_SCHEMA,
	TABS_SCHEMA,
	WINDOWS_SCHEMA,
} from './browser.schema';

/**
 * Composed workspace schema for browser state.
 *
 * Note: Table names use snake_case per Epicenter naming conventions.
 */
export const BROWSER_SCHEMA = {
	devices: {
		name: 'Devices',
		icon: { type: 'emoji', value: '💻' } as const,
		cover: null,
		description: 'Browser installations for multi-device sync',
		fields: DEVICES_SCHEMA,
	},
	tabs: {
		name: 'Tabs',
		icon: { type: 'emoji', value: '📑' } as const,
		cover: null,
		description: 'Browser tab state',
		fields: TABS_SCHEMA,
	},
	windows: {
		name: 'Windows',
		icon: { type: 'emoji', value: '🪟' } as const,
		cover: null,
		description: 'Browser window state',
		fields: WINDOWS_SCHEMA,
	},
	tab_groups: {
		name: 'Tab Groups',
		icon: { type: 'emoji', value: '📁' } as const,
		cover: null,
		description: 'Chrome tab groups (Chrome 88+)',
		fields: TAB_GROUPS_SCHEMA,
	},
} as const;

/**
 * Type-safe database instance for browser state.
 */
export type BrowserDb = Tables<ExtractTablesSchema<typeof BROWSER_SCHEMA>>;
