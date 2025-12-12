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
export default defineBackground(async () => {
	console.log('[Background] Initializing Tab Manager...');

	// Create the workspace client - initializes Y.Doc, providers, and exports
	const client = createWorkspaceClient(backgroundWorkspace);

	// Wait for IndexedDB to load persisted state
	await client.whenSynced;

	// Always sync from Chrome on every background script initialization.
	// This is necessary because:
	// 1. Tab/window IDs change on browser restart
	// 2. Service worker can be terminated and restarted at any time (MV3)
	// 3. IndexedDB may have stale data from a previous session
	await client.syncAllFromChrome();

	// NOW start accepting popup connections.
	// This must happen AFTER Chrome sync to avoid serving stale/partial data.
	// If we registered the listener earlier, popups could connect during sync
	// and receive data in an inconsistent state (e.g., after $clearAll but
	// before tabs/windows are re-added).
	client.startPopupSync();

	console.log('[Background] Tab Manager initialized');
});
