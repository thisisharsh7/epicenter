import { defineBackground } from 'wxt/utils/define-background';

/**
 * Minimal background script for Tab Manager
 *
 * In the popup-first architecture, the background script is minimal.
 * It primarily exists to:
 * 1. Keep the extension "alive" for event listeners
 * 2. Potentially sync tab events to IndexedDB in the future
 *
 * The popup handles all Epicenter client initialization and tab operations.
 */
export default defineBackground(() => {
	console.log('[Tab Manager] Background script initialized');

	// Listen for extension install/update
	browser.runtime.onInstalled.addListener((details) => {
		console.log('[Tab Manager] Extension installed/updated:', details.reason);
	});
});
