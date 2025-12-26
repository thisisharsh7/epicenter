/**
 * Browser state schema composition.
 *
 * Used by the background workspace for server sync and persistence.
 * The popup reads directly from Chrome APIs, not from Y.Doc.
 */

import type { Tables } from '@epicenter/hq';
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
	devices: DEVICES_SCHEMA,
	tabs: TABS_SCHEMA,
	windows: WINDOWS_SCHEMA,
	tab_groups: TAB_GROUPS_SCHEMA,
} as const;

/**
 * Type-safe database instance for browser state.
 */
export type BrowserDb = Tables<typeof BROWSER_SCHEMA>;
