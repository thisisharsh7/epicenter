/**
 * Popup ↔ Background Y.Doc sync via chrome.runtime.connect.
 *
 * This module handles the communication between the background service worker
 * and any connected popups. The background holds the authoritative Y.Doc,
 * and popups receive a replica that stays in sync.
 *
 * Protocol:
 * 1. Popup connects via chrome.runtime.connect({ name: 'yjs-sync' })
 * 2. Background sends full Y.Doc state immediately
 * 3. Background forwards Y.Doc updates to popup
 * 4. Popup sends local updates to background
 */

import * as Y from 'yjs';

/**
 * Message types for the sync protocol.
 *
 * We use number arrays instead of Uint8Array because chrome.runtime
 * serializes messages to JSON, which doesn't support Uint8Array.
 */
type SyncMessage =
	| { type: 'sync-state'; state: number[] }
	| { type: 'update'; update: number[] };

/**
 * Set up popup sync via chrome.runtime.connect.
 *
 * When a popup connects:
 * 1. Send the full Y.Doc state
 * 2. Listen for updates from the popup and apply them
 * 3. Forward Y.Doc updates from other sources (Chrome events) to the popup
 */
export function setupPopupSync(ydoc: Y.Doc) {
	browser.runtime.onConnect.addListener((port: Browser.runtime.Port) => {
		// Only handle yjs-sync connections
		if (port.name !== 'yjs-sync') return;

		console.log('[Popup Sync] Popup connected');

		// Send full state to popup on connect
		const state = Y.encodeStateAsUpdate(ydoc);
		const message: SyncMessage = {
			type: 'sync-state',
			state: Array.from(state),
		};
		port.postMessage(message);

		// Listen for updates from popup
		port.onMessage.addListener((msg: SyncMessage) => {
			if (msg.type === 'update') {
				// Apply update from popup
				// Use 'popup' as origin to prevent echoing back
				Y.applyUpdate(ydoc, new Uint8Array(msg.update), 'popup');
			}
		});

		// Forward Y.Doc updates to popup
		const updateHandler = (update: Uint8Array, origin: unknown) => {
			// Don't echo back updates that came from this popup
			if (origin === 'popup') return;

			const message: SyncMessage = {
				type: 'update',
				update: Array.from(update),
			};
			port.postMessage(message);
		};

		ydoc.on('update', updateHandler);

		// Clean up on disconnect
		port.onDisconnect.addListener(() => {
			console.log('[Popup Sync] Popup disconnected');
			ydoc.off('update', updateHandler);
		});
	});

	console.log('[Popup Sync] Listener registered');
}
