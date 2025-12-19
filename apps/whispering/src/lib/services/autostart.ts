import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { Err, Ok, tryAsync, type Result } from 'wellcrafted/result';

/**
 * Auto-start service for desktop platforms.
 * Enables/disables launching Whispering on system login.
 *
 * Platform-specific behavior:
 * - macOS: Creates Launch Agent in ~/Library/LaunchAgents/
 * - Windows: Adds registry entry to HKEY_CURRENT_USER\...\Run
 * - Linux: Creates .desktop file in ~/.config/autostart/
 */

export const { AutostartServiceError, AutostartServiceErr } =
	createTaggedError('AutostartServiceError');
export type AutostartServiceError = ReturnType<typeof AutostartServiceError>;

let autostartModule: typeof import('@tauri-apps/plugin-autostart') | null = null;

async function getAutostartModule() {
	if (!autostartModule && window.__TAURI_INTERNALS__) {
		autostartModule = await import('@tauri-apps/plugin-autostart');
	}
	return autostartModule;
}

/**
 * Check if auto-start is currently enabled
 */
export async function isEnabled(): Promise<boolean> {
	const module = await getAutostartModule();
	if (!module) return false;

	const { data, error } = await tryAsync({
		try: async () => {
			return await module.isEnabled();
		},
		catch: (error) => {
			console.error('Failed to check autostart status:', error);
			return Ok(false);
		},
	});

	return error ? false : data;
}

/**
 * Enable auto-start on system login
 */
export async function enable(): Promise<Result<void, AutostartServiceError>> {
	const module = await getAutostartModule();
	if (!module) {
		return Ok(void 0);
	}

	return await tryAsync({
		try: async () => {
			await module.enable();
		},
		catch: (error) =>
			AutostartServiceErr({
				message: `Failed to enable autostart: ${extractErrorMessage(error)}`,
			}),
	});
}

/**
 * Disable auto-start on system login
 */
export async function disable(): Promise<Result<void, AutostartServiceError>> {
	const module = await getAutostartModule();
	if (!module) {
		return Ok(void 0);
	}

	return await tryAsync({
		try: async () => {
			await module.disable();
		},
		catch: (error) =>
			AutostartServiceErr({
				message: `Failed to disable autostart: ${extractErrorMessage(error)}`,
			}),
	});
}
