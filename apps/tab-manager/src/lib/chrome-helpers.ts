/**
 * Chrome API type conversion helpers.
 *
 * Converts Chrome tab/window types to our schema row types.
 * Used by both background (for Y.Doc sync) and popup (for direct Chrome queries).
 */

import { type Tab, type TabGroup, type Window } from './epicenter/browser.schema';

/**
 * Convert a Chrome tab to our schema row type.
 */
export function chromeTabToRow(tab: Browser.tabs.Tab): Tab {
	return {
		id: String(tab.id),
		window_id: String(tab.windowId),
		url: tab.url ?? '',
		title: tab.title ?? '',
		fav_icon_url: tab.favIconUrl ?? null,
		index: tab.index,
		pinned: tab.pinned,
		active: tab.active,
		highlighted: tab.highlighted,
		muted: tab.mutedInfo?.muted ?? false,
		audible: tab.audible ?? false,
		discarded: tab.discarded,
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

/**
 * Convert a Chrome window to our schema row type.
 */
export function chromeWindowToRow(win: Browser.windows.Window): Window {
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

/**
 * Convert a Chrome tab group to our schema row type.
 * Note: Tab groups are Chrome 88+ only, not supported on Firefox.
 */
export function chromeTabGroupToRow(group: Browser.tabGroups.TabGroup): TabGroup {
	return {
		id: String(group.id),
		window_id: String(group.windowId),
		title: group.title ?? null,
		color: group.color ?? 'grey',
		collapsed: group.collapsed ?? false,
	};
}
