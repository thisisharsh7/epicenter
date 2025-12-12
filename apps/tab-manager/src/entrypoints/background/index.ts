import { defineBackground } from 'wxt/utils/define-background';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { setupPopupSync } from './popup-sync';
import { setupChromeSync } from './chrome-sync';

/**
 * Background service worker for Tab Manager.
 *
 * This is the hub of the extension:
 * 1. Holds the authoritative Y.Doc
 * 2. Persists to IndexedDB
 * 3. Syncs with popup via chrome.runtime.connect
 * 4. Syncs Chrome tabs ↔ Y.Doc
 * 5. (Future) Syncs with server via WebSocket
 */
export default defineBackground(() => {
	console.log('[Background] Initializing Tab Manager...');

	// Create the Y.Doc - this is the single source of truth
	const ydoc = new Y.Doc({ guid: 'browser' });

	// Set up IndexedDB persistence
	const persistence = new IndexeddbPersistence('tab-manager', ydoc);

	persistence.on('synced', () => {
		console.log('[Background] IndexedDB synced');
	});

	// Set up Chrome ↔ Y.Doc sync
	const chromeSync = setupChromeSync(ydoc);

	// Set up popup sync via chrome.runtime.connect
	setupPopupSync(ydoc);

	// Initial sync on extension install/update
	browser.runtime.onInstalled.addListener(async (details) => {
		console.log('[Background] Extension installed/updated:', details.reason);

		// Wait for IndexedDB to sync before doing initial Chrome sync
		await persistence.whenSynced;

		// Do initial sync from Chrome
		await chromeSync.syncAllFromChrome();
	});

	// Also sync on browser startup (tab IDs have changed)
	browser.runtime.onStartup.addListener(async () => {
		console.log('[Background] Browser started, syncing tabs...');

		// Wait for IndexedDB to sync
		await persistence.whenSynced;

		// Do full sync from Chrome (IDs have changed)
		await chromeSync.syncAllFromChrome();
	});

	console.log('[Background] Tab Manager initialized');
});
