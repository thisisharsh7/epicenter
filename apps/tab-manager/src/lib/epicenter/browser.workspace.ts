/**
 * Browser workspace definition.
 *
 * Defines the full workspace with schema, providers, and exports for
 * use in the popup context. The background uses the same schema but
 * doesn't need the sync provider (it IS the authority).
 */

import { defineWorkspace, type Tables } from '@epicenter/hq';
import * as Y from 'yjs';
import {
	TABS_SCHEMA,
	WINDOWS_SCHEMA,
	TAB_GROUPS_SCHEMA,
	type Tab,
	type Window,
} from './browser.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Schema Composition
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Definition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Message types for the sync protocol.
 * Must match the types in background/popup-sync.ts
 */
type SyncMessage =
	| { type: 'sync-state'; state: number[] }
	| { type: 'update'; update: number[] };

/**
 * Browser workspace for the popup context.
 *
 * This workspace connects to the background service worker for sync and
 * exposes typed accessors for browser state (tabs, windows, tab groups).
 */
export const browserWorkspace = defineWorkspace({
	id: 'browser',
	tables: BROWSER_SCHEMA,
	providers: {
		/**
		 * Provider that syncs the popup's Y.Doc with the background service worker.
		 *
		 * This is a browser-specific provider that uses the browser extension
		 * messaging API to sync with the background context.
		 */
		backgroundSync: ({ ydoc }) => {
			// Connect to background via browser.runtime port
			const port = browser.runtime.connect({ name: 'yjs-sync' });

			console.log('[Background Sync] Connecting to background...');

			// Receive updates from background
			port.onMessage.addListener((msg: SyncMessage) => {
				if (msg.type === 'sync-state') {
					// Initial full state sync
					console.log('[Background Sync] Received initial state');
					Y.applyUpdate(ydoc, new Uint8Array(msg.state), 'background');
				} else if (msg.type === 'update') {
					// Incremental update
					Y.applyUpdate(ydoc, new Uint8Array(msg.update), 'background');
				}
			});

			// Send local updates to background
			const updateHandler = (update: Uint8Array, origin: unknown) => {
				// Don't echo back updates that came from background
				if (origin === 'background') return;

				const message: SyncMessage = {
					type: 'update',
					update: Array.from(update),
				};
				port.postMessage(message);
			};

			ydoc.on('update', updateHandler);

			// Handle disconnect
			port.onDisconnect.addListener(() => {
				console.log('[Background Sync] Disconnected from background');
				ydoc.off('update', updateHandler);
			});

			// Return cleanup function
			return {
				destroy() {
					ydoc.off('update', updateHandler);
					port.disconnect();
				},
			};
		},
	},
	exports: ({ tables }) => ({
		/**
		 * Get the tables for direct access.
		 */
		tables,

		/**
		 * Get all tabs sorted by index.
		 */
		getAllTabs(): Tab[] {
			return tables.tabs.getAllValid().sort((a, b) => a.index - b.index);
		},

		/**
		 * Get all windows.
		 */
		getAllWindows(): Window[] {
			return tables.windows.getAllValid();
		},

		/**
		 * Get tabs for a specific window.
		 */
		getTabsByWindow(windowId: string): Tab[] {
			return tables.tabs
				.filter((t) => t.window_id === windowId)
				.sort((a, b) => a.index - b.index);
		},
	}),
});
