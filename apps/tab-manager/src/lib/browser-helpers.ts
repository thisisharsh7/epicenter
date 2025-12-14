/**
 * Browser API type conversion helpers.
 *
 * Converts browser tab/window types to our schema row types.
 * Used by both background (for Y.Doc sync) and popup (for direct browser queries).
 *
 * All IDs are device-scoped to prevent collisions during multi-device sync.
 */

import type { Tab, TabGroup, Window } from './epicenter/browser.schema';
import { createCompositeIds } from './device-id';

// ─────────────────────────────────────────────────────────────────────────────
// Tab Conversion
// ─────────────────────────────────────────────────────────────────────────────

type TabToRowParams = {
	tab: Browser.tabs.Tab;
	deviceId: string;
};

/**
 * Convert a browser tab to our schema row type.
 * IDs are scoped to the device to prevent collisions.
 */
export function browserTabToRow({ tab, deviceId }: TabToRowParams): Tab {
	const { TabId, WindowId, GroupId } = createCompositeIds(deviceId);
	return {
		id: TabId(tab.id!),
		device_id: deviceId,
		tab_id: tab.id!,
		window_id: WindowId(tab.windowId!),
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
				? GroupId(tab.groupId)
				: null,
		opener_tab_id:
			tab.openerTabId !== undefined ? TabId(tab.openerTabId) : null,
		incognito: tab.incognito ?? false,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Window Conversion
// ─────────────────────────────────────────────────────────────────────────────

type WindowToRowParams = {
	window: Browser.windows.Window;
	deviceId: string;
};

/**
 * Convert a browser window to our schema row type.
 * IDs are scoped to the device to prevent collisions.
 */
export function browserWindowToRow({ window, deviceId }: WindowToRowParams): Window {
	const { WindowId } = createCompositeIds(deviceId);
	return {
		id: WindowId(window.id!),
		device_id: deviceId,
		window_id: window.id!,
		state: window.state ?? 'normal',
		type: window.type ?? 'normal',
		focused: window.focused ?? false,
		always_on_top: window.alwaysOnTop ?? false,
		incognito: window.incognito ?? false,
		top: window.top ?? 0,
		left: window.left ?? 0,
		width: window.width ?? 800,
		height: window.height ?? 600,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Group Conversion
// ─────────────────────────────────────────────────────────────────────────────

type TabGroupToRowParams = {
	group: Browser.tabGroups.TabGroup;
	deviceId: string;
};

/**
 * Convert a browser tab group to our schema row type.
 * Note: Tab groups are Chrome 88+ only, not supported on Firefox.
 * IDs are scoped to the device to prevent collisions.
 */
export function browserTabGroupToRow({ group, deviceId }: TabGroupToRowParams): TabGroup {
	const { WindowId, GroupId } = createCompositeIds(deviceId);
	return {
		id: GroupId(group.id),
		device_id: deviceId,
		group_id: group.id,
		window_id: WindowId(group.windowId),
		title: group.title ?? null,
		color: group.color ?? 'grey',
		collapsed: group.collapsed ?? false,
	};
}
