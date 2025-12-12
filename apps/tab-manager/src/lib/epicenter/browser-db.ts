/**
 * Browser database schema composition.
 *
 * Combines individual table schemas into a workspace schema that can be used
 * with `createEpicenterDb` in both background and popup contexts.
 */

import type { Tables } from '@epicenter/hq';
import { TABS_SCHEMA, WINDOWS_SCHEMA, TAB_GROUPS_SCHEMA } from './browser.schema';

/**
 * Composed workspace schema for browser state.
 *
 * Note: Table names use snake_case per Epicenter naming conventions.
 */
export const BROWSER_SCHEMA = {
	tabs: TABS_SCHEMA,
	windows: WINDOWS_SCHEMA,
	tab_groups: TAB_GROUPS_SCHEMA,
} as const;

/**
 * Type-safe database instance for browser state.
 */
export type BrowserDb = Tables<typeof BROWSER_SCHEMA>;
