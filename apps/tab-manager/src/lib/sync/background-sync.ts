/**
 * Popup → Background Y.Doc sync client.
 *
 * Connects to the background service worker and keeps a local Y.Doc
 * replica in sync with the authoritative copy in the background.
 */

import * as Y from 'yjs';

/**
 * Message types for the sync protocol.
 * Must match the types in background/popup-sync.ts
 */
type SyncMessage =
	| { type: 'sync-state'; state: number[] }
	| { type: 'update'; update: number[] };

/**
 * Connect to the background service worker and sync Y.Doc.
 *
 * @param ydoc - The Y.Doc to sync
 * @returns A cleanup function to disconnect
 */
export function connectToBackground(ydoc: Y.Doc): () => void {
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
	return () => {
		ydoc.off('update', updateHandler);
		port.disconnect();
	};
}

/**
 * Create a Y.Doc connected to the background service worker.
 *
 * This is a convenience function for setting up the popup's Y.Doc.
 */
export function createSyncedDoc(): { ydoc: Y.Doc; disconnect: () => void } {
	const ydoc = new Y.Doc({ guid: 'browser' });
	const disconnect = connectToBackground(ydoc);
	return { ydoc, disconnect };
}
