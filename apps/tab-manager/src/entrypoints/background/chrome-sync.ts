/**
 * Chrome ↔ Y.Doc sync module.
 *
 * Handles two-way synchronization between Chrome tabs/windows and Y.Doc:
 * 1. Chrome → Y.Doc: Event listeners update Y.Doc when Chrome state changes
 * 2. Y.Doc → Chrome: (Future) Observers apply Y.Doc changes to Chrome
 */

import * as Y from 'yjs';
import type { Tab, Window, TabGroup } from '$lib/epicenter/browser.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Y.Doc Table Access
// ─────────────────────────────────────────────────────────────────────────────

function getTablesMap(ydoc: Y.Doc): Y.Map<Y.Map<Y.Map<unknown>>> {
	return ydoc.getMap('tables') as Y.Map<Y.Map<Y.Map<unknown>>>;
}

function getTabsTable(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
	const tables = getTablesMap(ydoc);
	if (!tables.has('tabs')) {
		tables.set('tabs', new Y.Map() as Y.Map<Y.Map<unknown>>);
	}
	return tables.get('tabs') as Y.Map<Y.Map<unknown>>;
}

function getWindowsTable(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
	const tables = getTablesMap(ydoc);
	if (!tables.has('windows')) {
		tables.set('windows', new Y.Map() as Y.Map<Y.Map<unknown>>);
	}
	return tables.get('windows') as Y.Map<Y.Map<unknown>>;
}

function getTabGroupsTable(ydoc: Y.Doc): Y.Map<Y.Map<unknown>> {
	const tables = getTablesMap(ydoc);
	if (!tables.has('tabGroups')) {
		tables.set('tabGroups', new Y.Map() as Y.Map<Y.Map<unknown>>);
	}
	return tables.get('tabGroups') as Y.Map<Y.Map<unknown>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: Convert Chrome types to Y.Doc rows
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
// Helpers: Y.Doc operations
// ─────────────────────────────────────────────────────────────────────────────

function setRow(table: Y.Map<Y.Map<unknown>>, id: string, data: Record<string, unknown>) {
	const row = new Y.Map<unknown>();
	for (const [key, value] of Object.entries(data)) {
		row.set(key, value);
	}
	table.set(id, row);
}

function updateRow(table: Y.Map<Y.Map<unknown>>, id: string, updates: Record<string, unknown>) {
	const row = table.get(id);
	if (!row) return;
	for (const [key, value] of Object.entries(updates)) {
		row.set(key, value);
	}
}

function deleteRow(table: Y.Map<Y.Map<unknown>>, id: string) {
	table.delete(id);
}

function clearTable(table: Y.Map<Y.Map<unknown>>) {
	table.clear();
}

function getAllRows<T>(table: Y.Map<Y.Map<unknown>>): T[] {
	const rows: T[] = [];
	for (const row of table.values()) {
		const obj: Record<string, unknown> = {};
		for (const [key, value] of row.entries()) {
			obj[key] = value;
		}
		rows.push(obj as T);
	}
	return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chrome Sync Setup
// ─────────────────────────────────────────────────────────────────────────────

export function setupChromeSync(ydoc: Y.Doc) {
	const tabsTable = getTabsTable(ydoc);
	const windowsTable = getWindowsTable(ydoc);
	const tabGroupsTable = getTabGroupsTable(ydoc);

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

		ydoc.transact(() => {
			// Clear existing data
			clearTable(tabsTable);
			clearTable(windowsTable);
			clearTable(tabGroupsTable);

			// Sync windows first (tabs reference windows)
			for (const win of chromeWindows) {
				if (win.id === undefined) continue;
				const row = chromeWindowToRow(win);
				setRow(windowsTable, row.id, row);
			}

			// Sync tabs
			for (const tab of chromeTabs) {
				if (tab.id === undefined) continue;
				const row = chromeTabToRow(tab);
				setRow(tabsTable, row.id, row);
			}
		});

		// Sync tab groups (Chrome 88+ only)
		if (browser.tabGroups) {
			const chromeGroups = await browser.tabGroups.query({});
			ydoc.transact(() => {
				for (const group of chromeGroups) {
					const row = chromeTabGroupToRow(group);
					setRow(tabGroupsTable, row.id, row);
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
		const row = chromeTabToRow(tab);
		ydoc.transact(() => {
			setRow(tabsTable, row.id, row);
		});
	});

	browser.tabs.onRemoved.addListener((tabId) => {
		ydoc.transact(() => {
			deleteRow(tabsTable, String(tabId));
		});
	});

	browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
		if (tab.id === undefined) return;
		const row = chromeTabToRow(tab);
		ydoc.transact(() => {
			// Check if tab exists, create if not (can happen with rapid events)
			if (tabsTable.has(row.id)) {
				const { id, ...updates } = row;
				updateRow(tabsTable, id, updates);
			} else {
				setRow(tabsTable, row.id, row);
			}
		});
	});

	browser.tabs.onActivated.addListener(({ tabId, windowId }) => {
		ydoc.transact(() => {
			// Deactivate all tabs in the window
			const allTabs = getAllRows<Tab>(tabsTable);
			for (const tab of allTabs) {
				if (tab.window_id === String(windowId) && tab.active && tab.id !== String(tabId)) {
					updateRow(tabsTable, tab.id, { active: false });
				}
			}
			// Activate the new tab
			updateRow(tabsTable, String(tabId), { active: true });
		});
	});

	browser.tabs.onMoved.addListener((tabId, { windowId, fromIndex, toIndex }) => {
		ydoc.transact(() => {
			// Get all tabs in the window
			const allTabs = getAllRows<Tab>(tabsTable);
			const windowTabs = allTabs
				.filter((t) => t.window_id === String(windowId))
				.sort((a, b) => a.index - b.index);

			// Update indices
			for (const tab of windowTabs) {
				if (tab.id === String(tabId)) {
					updateRow(tabsTable, tab.id, { index: toIndex });
				} else if (fromIndex < toIndex) {
					// Moving right: decrement tabs in between
					if (tab.index > fromIndex && tab.index <= toIndex) {
						updateRow(tabsTable, tab.id, { index: tab.index - 1 });
					}
				} else {
					// Moving left: increment tabs in between
					if (tab.index >= toIndex && tab.index < fromIndex) {
						updateRow(tabsTable, tab.id, { index: tab.index + 1 });
					}
				}
			}
		});
	});

	browser.tabs.onAttached.addListener((tabId, { newWindowId, newPosition }) => {
		ydoc.transact(() => {
			updateRow(tabsTable, String(tabId), {
				window_id: String(newWindowId),
				index: newPosition,
			});
		});
	});

	browser.tabs.onDetached.addListener((_tabId, _detachInfo) => {
		// Tab is being moved to another window; onAttached will handle the update
	});

	// --- Window Events ---

	browser.windows.onCreated.addListener((win) => {
		if (win.id === undefined) return;
		const row = chromeWindowToRow(win);
		ydoc.transact(() => {
			setRow(windowsTable, row.id, row);
		});
	});

	browser.windows.onRemoved.addListener((windowId) => {
		ydoc.transact(() => {
			deleteRow(windowsTable, String(windowId));
			// Note: Tabs are automatically removed by their own onRemoved events
		});
	});

	browser.windows.onFocusChanged.addListener((windowId) => {
		ydoc.transact(() => {
			// Unfocus all windows
			const allWindows = getAllRows<Window>(windowsTable);
			for (const win of allWindows) {
				if (win.focused) {
					updateRow(windowsTable, win.id, { focused: false });
				}
			}
			// Focus the new window (if not WINDOW_ID_NONE)
			if (windowId !== browser.windows.WINDOW_ID_NONE) {
				updateRow(windowsTable, String(windowId), { focused: true });
			}
		});
	});

	// --- Tab Group Events (Chrome 88+ only) ---

	if (browser.tabGroups) {
		browser.tabGroups.onCreated.addListener((group) => {
			const row = chromeTabGroupToRow(group);
			ydoc.transact(() => {
				setRow(tabGroupsTable, row.id, row);
			});
		});

		browser.tabGroups.onRemoved.addListener((group) => {
			ydoc.transact(() => {
				deleteRow(tabGroupsTable, String(group.id));
			});
		});

		browser.tabGroups.onUpdated.addListener((group) => {
			const row = chromeTabGroupToRow(group);
			ydoc.transact(() => {
				const { id, ...updates } = row;
				updateRow(tabGroupsTable, id, updates);
			});
		});
	}

	console.log('[Chrome Sync] Event listeners registered');

	return {
		syncAllFromChrome,
	};
}
