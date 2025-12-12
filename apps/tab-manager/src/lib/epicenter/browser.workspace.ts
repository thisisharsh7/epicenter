/**
 * Popup workspace definition.
 *
 * Used in the popup context to sync with the background service worker.
 * The popup holds a Y.Doc replica that receives updates from the background.
 */

import { defineWorkspace } from '@epicenter/hq';
import * as Y from 'yjs';
import { type Tab, type Window } from './browser.schema';
import { BROWSER_SCHEMA, type SyncMessage } from './schema';

/**
 * Popup workspace that syncs with the background service worker.
 *
 * The popup connects to the background via chrome.runtime.connect and
 * receives Y.Doc updates. This is a replica - the background is authoritative.
 */
export const popupWorkspace = defineWorkspace({
	id: 'browser',
	tables: BROWSER_SCHEMA,
	providers: {
		/**
		 * Provider that syncs the popup's Y.Doc with the background service worker.
		 *
		 * Uses the browser extension messaging API to connect to the background
		 * and receive Y.Doc updates.
		 */
		backgroundSync: ({ ydoc }) => {
			// Connect to background via browser.runtime port
			const port = browser.runtime.connect({ name: 'yjs-sync' });

			console.log('[Popup Sync] Connecting to background...');

			// Receive updates from background
			port.onMessage.addListener((msg: SyncMessage) => {
				if (msg.type === 'sync-state') {
					// Initial full state sync
					console.log('[Popup Sync] Received initial state');
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
				console.log('[Popup Sync] Disconnected from background');
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

// Re-export for backwards compatibility
export { BROWSER_SCHEMA, type BrowserDb } from './schema';
