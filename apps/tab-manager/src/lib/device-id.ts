/**
 * Device ID utilities for multi-device tab sync.
 *
 * Provides stable device identification and composite ID helpers
 * for scoping browser tab/window/group IDs to specific devices.
 */

import { generateId } from '@epicenter/hq';
import { storage } from '@wxt-dev/storage';

// ─────────────────────────────────────────────────────────────────────────────
// Device ID Storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Device ID storage item.
 * Auto-generates a NanoID on first access if not already set.
 */
const deviceIdItem = storage.defineItem<string>('local:deviceId', {
	init: () => generateId(),
});

/**
 * Get the stable device ID for this browser installation.
 * Generated once on first install, persisted in storage.local.
 */
export async function getDeviceId(): Promise<string> {
	// getValue() can technically return null if storage fails, but our init
	// function ensures a value is always generated. Assert non-null here.
	const deviceId = await deviceIdItem.getValue();
	if (!deviceId) {
		throw new Error('Device ID not found - storage may have failed');
	}
	return deviceId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser & OS Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the current browser name from WXT environment.
 */
export function getBrowserName(): string {
	return import.meta.env.BROWSER; // 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera'
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate a default device name like "Chrome on macOS".
 */
export async function generateDefaultDeviceName(): Promise<string> {
	const browserName = capitalize(import.meta.env.BROWSER);
	const platformInfo = await browser.runtime.getPlatformInfo();
	const osName = (
		{
			mac: 'macOS',
			win: 'Windows',
			linux: 'Linux',
			cros: 'ChromeOS',
			android: 'Android',
			openbsd: 'OpenBSD',
			fuchsia: 'Fuchsia',
		} satisfies Record<Browser.runtime.PlatformInfo['os'], string>
	)[platformInfo.os];
	return `${browserName} on ${osName}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite ID Utilities
// ─────────────────────────────────────────────────────────────────────────────

type CompositeIdParts = {
	deviceId: string;
	id: number | string;
};

/**
 * Create a composite ID from device ID and browser's tab/window/group ID.
 *
 * @example
 * createCompositeId({ deviceId: 'abc123', id: 456 }) // 'abc123_456'
 */
export function createCompositeId({ deviceId, id }: CompositeIdParts): string {
	return `${deviceId}_${id}`;
}

/**
 * Parse a composite ID into its parts.
 * Returns null if the format is invalid.
 *
 * @example
 * parseCompositeId('abc123_456') // { deviceId: 'abc123', id: 456 }
 * parseCompositeId('invalid') // null
 */
export function parseCompositeId(
	compositeId: string,
): { deviceId: string; id: number } | null {
	const idx = compositeId.indexOf('_');
	if (idx === -1) return null;

	const deviceId = compositeId.slice(0, idx);
	const id = Number.parseInt(compositeId.slice(idx + 1), 10);

	if (Number.isNaN(id)) return null;

	return { deviceId, id };
}
