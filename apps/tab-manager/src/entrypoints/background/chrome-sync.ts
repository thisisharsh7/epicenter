/**
 * Chrome ↔ Y.Doc sync module.
 *
 * Handles two-way synchronization between Chrome tabs/windows and Y.Doc:
 * 1. Chrome → Y.Doc: Event listeners update Y.Doc when Chrome state changes
 * 2. Y.Doc → Chrome: (Future) Observers apply Y.Doc changes to Chrome
 */

import { createEpicenterDb } from '@epicenter/hq';
import type * as Y from 'yjs';
import type { Tab, Window, TabGroup } from '$lib/epicenter/browser.schema';
import { BROWSER_SCHEMA } from '$lib/epicenter/browser-db';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: Convert Chrome types to schema rows
// ─────────────────────────────────────────────────────────────────────────────

function chromeTabToRow(tab: Browser.tabs.Tab): Tab {
	return {
		id: String(tab.id),
		window_id: String(tab.windowId),
		url: tab.url ?? '',
		title: tab.title ?? '',
		fav_icon_url: tab.favIconUrl ?? null,
		index: tab.index,
		pinned: tab.pinned ?? false,
		active: tab.active ?? false,
		highlighted: tab.highlighted ?? false,
		muted: tab.mutedInfo?.muted ?? false,
		audible: tab.audible ?? false,
		discarded: tab.discarded ?? false,
		auto_discardable: tab.autoDiscardable ?? true,
		status: tab.status ?? 'complete',
		group_id:
			tab.groupId !== undefined && tab.groupId !== -1
				? String(tab.groupId)
				: null,
		opener_tab_id:
			tab.openerTabId !== undefined ? String(tab.openerTabId) : null,
		incognito: tab.incognito ?? false,
	};
}

function chromeWindowToRow(win: Browser.windows.Window): Window {
	return {
		id: String(win.id),
		state: win.state ?? 'normal',
		type: win.type ?? 'normal',
		focused: win.focused ?? false,
		always_on_top: win.alwaysOnTop ?? false,
		incognito: win.incognito ?? false,
		top: win.top ?? 0,
		left: win.left ?? 0,
		width: win.width ?? 800,
		height: win.height ?? 600,
	};
}

function chromeTabGroupToRow(group: Browser.tabGroups.TabGroup): TabGroup {
	return {
		id: String(group.id),
		window_id: String(group.windowId),
		title: group.title ?? null,
		color: group.color ?? 'grey',
		collapsed: group.collapsed ?? false,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Chrome Sync Setup
// ─────────────────────────────────────────────────────────────────────────────

export function setupChromeSync(ydoc: Y.Doc) {
	const db = createEpicenterDb(ydoc, BROWSER_SCHEMA);

	// ═══════════════════════════════════════════════════════════════════════════
	// INITIAL SYNC - Destructive sync on startup
	// ═══════════════════════════════════════════════════════════════════════════

	async function syncAllFromChrome() {
		console.log('[Chrome Sync] Starting full sync from Chrome...');

		// Get all windows and tabs from Chrome
		const [chromeTabs, chromeWindows] = await Promise.all([
			browser.tabs.query({}),
			browser.windows.getAll(),
		]);

		db.$transact(() => {
			// Clear existing data
			db.$clearAll();

			// Sync windows first (tabs reference windows)
			for (const win of chromeWindows) {
				if (win.id === undefined) continue;
				db.windows.upsert(chromeWindowToRow(win));
			}

			// Sync tabs
			for (const tab of chromeTabs) {
				if (tab.id === undefined) continue;
				db.tabs.upsert(chromeTabToRow(tab));
			}
		});

		// Sync tab groups (Chrome 88+ only)
		if (browser.tabGroups) {
			const chromeGroups = await browser.tabGroups.query({});
			db.$transact(() => {
				for (const group of chromeGroups) {
					db.tab_groups.upsert(chromeTabGroupToRow(group));
				}
			});
		}

		console.log(
			`[Chrome Sync] Synced ${chromeTabs.length} tabs, ${chromeWindows.length} windows`,
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// CHROME EVENT LISTENERS - Chrome → Y.Doc
	// ═══════════════════════════════════════════════════════════════════════════

	// --- Tab Events ---

	browser.tabs.onCreated.addListener((tab) => {
		if (tab.id === undefined) return;
		db.tabs.upsert(chromeTabToRow(tab));
	});

	browser.tabs.onRemoved.addListener((tabId) => {
		db.tabs.delete({ id: String(tabId) });
	});

	browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
		if (tab.id === undefined) return;
		// upsert handles both create and update
		db.tabs.upsert(chromeTabToRow(tab));
	});

	browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
		db.$transact(() => {
			// Deactivate all tabs in the window
			const windowTabs = db.tabs.filter(
				(t) => t.window_id === String(windowId) && t.active && t.id !== String(tabId),
			);
			for (const tab of windowTabs) {
				db.tabs.update({ id: tab.id, active: false });
			}
			// Activate the new tab
			db.tabs.update({ id: String(tabId), active: true });
		});
	});

	browser.tabs.onMoved.addListener((tabId, { windowId, fromIndex, toIndex }) => {
		db.$transact(() => {
			// Get all tabs in the window sorted by index
			const windowTabs = db.tabs
				.filter((t) => t.window_id === String(windowId))
				.sort((a, b) => a.index - b.index);

			// Update indices
			for (const tab of windowTabs) {
				if (tab.id === String(tabId)) {
					db.tabs.update({ id: tab.id, index: toIndex });
				} else if (fromIndex < toIndex) {
					// Moving right: decrement tabs in between
					if (tab.index > fromIndex && tab.index <= toIndex) {
						db.tabs.update({ id: tab.id, index: tab.index - 1 });
					}
				} else {
					// Moving left: increment tabs in between
					if (tab.index >= toIndex && tab.index < fromIndex) {
						db.tabs.update({ id: tab.id, index: tab.index + 1 });
					}
				}
			}
		});
	});

	browser.tabs.onAttached.addListener((tabId, { newWindowId, newPosition }) => {
		db.tabs.update({
			id: String(tabId),
			window_id: String(newWindowId),
			index: newPosition,
		});
	});

	browser.tabs.onDetached.addListener((_tabId, _detachInfo) => {
		// Tab is being moved to another window; onAttached will handle the update
	});

	// --- Window Events ---

	browser.windows.onCreated.addListener((win) => {
		if (win.id === undefined) return;
		db.windows.upsert(chromeWindowToRow(win));
	});

	browser.windows.onRemoved.addListener((windowId) => {
		db.windows.delete({ id: String(windowId) });
		// Note: Tabs are automatically removed by their own onRemoved events
	});

	browser.windows.onFocusChanged.addListener((windowId) => {
		db.$transact(() => {
			// Unfocus all windows
			const focusedWindows = db.windows.filter((w) => w.focused);
			for (const win of focusedWindows) {
				db.windows.update({ id: win.id, focused: false });
			}
			// Focus the new window (if not WINDOW_ID_NONE)
			if (windowId !== browser.windows.WINDOW_ID_NONE) {
				db.windows.update({ id: String(windowId), focused: true });
			}
		});
	});

	// --- Tab Group Events (Chrome 88+ only) ---

	if (browser.tabGroups) {
		browser.tabGroups.onCreated.addListener((group) => {
			db.tab_groups.upsert(chromeTabGroupToRow(group));
		});

		browser.tabGroups.onRemoved.addListener((group) => {
			db.tab_groups.delete({ id: String(group.id) });
		});

		browser.tabGroups.onUpdated.addListener((group) => {
			db.tab_groups.upsert(chromeTabGroupToRow(group));
		});
	}

	console.log('[Chrome Sync] Event listeners registered');

	return {
		syncAllFromChrome,
	};
}
