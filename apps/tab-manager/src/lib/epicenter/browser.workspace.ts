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
		 *
		 * Returns a `whenSynced` promise that resolves when the initial state
		 * has been received from the background.
		 */
		backgroundSync: ({ ydoc, tables }) => {
			let currentPort: Browser.runtime.Port | null = null;
			let updateHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;
			let resolveWhenSynced: (() => void) | null = null;
			let isDestroyed = false;

			// Create a promise that resolves when we receive the initial state
			const whenSynced = new Promise<void>((resolve) => {
				resolveWhenSynced = resolve;
			});

			/**
			 * Connect to the background service worker.
			 * Retries with exponential backoff if initial sync doesn't arrive.
			 */
			function connect(attempt = 1) {
				if (isDestroyed) return;

				const maxAttempts = 5;
				const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);

				console.log(`[Popup Sync] Connecting to background (attempt ${attempt})...`);

				// Disconnect previous port if any
				if (currentPort) {
					currentPort.disconnect();
				}

				currentPort = browser.runtime.connect({ name: 'yjs-sync' });

				// Set up timeout to retry if no response
				const timeoutId = setTimeout(() => {
					if (attempt < maxAttempts) {
						console.warn(`[Popup Sync] No response from background, retrying in ${backoffMs}ms...`);
						connect(attempt + 1);
					} else {
						console.error('[Popup Sync] Failed to connect after', maxAttempts, 'attempts');
					}
				}, backoffMs);

				// Receive updates from background
				currentPort.onMessage.addListener((msg: SyncMessage) => {
					clearTimeout(timeoutId); // Got a response, cancel retry

					if (msg.type === 'sync-state') {
						// Initial full state sync
						Y.applyUpdate(ydoc, new Uint8Array(msg.state), 'background');

						console.log('[Popup Sync] Connected! Received initial state:', {
							tabs: tables.tabs.getAllValid().length,
							windows: tables.windows.getAllValid().length,
						});

						// Resolve whenSynced now that we have initial state
						resolveWhenSynced?.();
						resolveWhenSynced = null; // Only resolve once
					} else if (msg.type === 'update') {
						// Incremental update
						Y.applyUpdate(ydoc, new Uint8Array(msg.update), 'background');
					}
				});

				// Handle disconnect - attempt reconnect
				currentPort.onDisconnect.addListener(() => {
					console.log('[Popup Sync] Disconnected from background');
					clearTimeout(timeoutId);

					if (updateHandler) {
						ydoc.off('update', updateHandler);
					}

					// If not destroyed, try to reconnect (background may have restarted)
					if (!isDestroyed) {
						console.log('[Popup Sync] Will attempt to reconnect...');
						setTimeout(() => connect(1), 1000);
					}
				});

				// Set up Y.Doc update forwarding (popup → background, currently unused)
				if (updateHandler) {
					ydoc.off('update', updateHandler);
				}
				updateHandler = (update: Uint8Array, origin: unknown) => {
					if (origin === 'background') return;
					if (!currentPort) return;

					const message: SyncMessage = {
						type: 'update',
						update: Array.from(update),
					};
					currentPort.postMessage(message);
				};
				ydoc.on('update', updateHandler);
			}

			// Start connecting
			connect();

			return {
				whenSynced,
				destroy() {
					isDestroyed = true;
					if (updateHandler) {
						ydoc.off('update', updateHandler);
					}
					if (currentPort) {
						currentPort.disconnect();
					}
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
