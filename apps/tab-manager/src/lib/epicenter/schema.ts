/**
 * Browser state schema composition.
 *
 * Shared between popup and background workspaces.
 * Both contexts use the same data model but different providers.
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

/**
 * Message types for the sync protocol between background and popup.
 *
 * We use number arrays instead of Uint8Array because chrome.runtime
 * serializes messages to JSON, which doesn't support Uint8Array.
 */
export type SyncMessage =
	| { type: 'sync-state'; state: number[] }
	| { type: 'update'; update: number[] };
