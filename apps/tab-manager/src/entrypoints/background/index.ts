import { defineBackground } from 'wxt/utils/define-background';
import { createWorkspaceClient } from '@epicenter/hq';
import { backgroundWorkspace } from '$lib/epicenter/background.workspace';

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

	// Create the workspace client - initializes Y.Doc, providers, and exports
	const client = createWorkspaceClient(backgroundWorkspace);

	// Initial sync on extension install/update
	browser.runtime.onInstalled.addListener(async (details) => {
		console.log('[Background] Extension installed/updated:', details.reason);

		// Wait for IndexedDB to sync before doing initial Chrome sync
		await client.whenSynced;

		// Do initial sync from Chrome
		await client.syncAllFromChrome();
	});

	// Also sync on browser startup (tab IDs have changed)
	browser.runtime.onStartup.addListener(async () => {
		console.log('[Background] Browser started, syncing tabs...');

		// Wait for IndexedDB to sync
		await client.whenSynced;

		// Do full sync from Chrome (IDs have changed)
		await client.syncAllFromChrome();
	});

	console.log('[Background] Tab Manager initialized');
});
