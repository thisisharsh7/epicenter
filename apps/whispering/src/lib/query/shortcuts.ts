import { type Command, commandCallbacks } from '$lib/commands';
import type { KeyboardEventSupportedKey } from '$lib/constants/keyboard';
import { IS_MACOS } from '$lib/constants/platform';
import * as services from '$lib/services';
import { desktopServices } from '$lib/services';
import type { Accelerator } from '$lib/services/global-shortcut-manager';
import type { CommandId } from '$lib/services/local-shortcut-manager';
import { defineMutation } from './_client';

/**
 * Local shortcuts - cross-platform, work in web and desktop.
 * These use browser keyboard events.
 */
export const localShortcuts = {
	registerCommand: defineMutation({
		mutationKey: ['shortcuts', 'registerCommandLocally'] as const,
		mutationFn: ({
			command,
			keyCombination,
		}: {
			command: Command;
			keyCombination: KeyboardEventSupportedKey[];
		}) =>
			services.localShortcutManager.register({
				id: command.id as CommandId,
				keyCombination,
				callback: commandCallbacks[command.id],
				on: command.on,
			}),
	}),

	unregisterCommand: defineMutation({
		mutationKey: ['shortcuts', 'unregisterCommandLocally'] as const,
		mutationFn: async ({ commandId }: { commandId: CommandId }) =>
			services.localShortcutManager.unregister(commandId),
	}),
};

/**
 * Global shortcuts - desktop-only, require Tauri.
 * These use system-level global shortcuts that work even when the app is not focused.
 */
export const globalShortcuts = {
	registerCommand: defineMutation({
		mutationKey: ['shortcuts', 'registerCommandGlobally'] as const,
		mutationFn: ({
			command,
			// Parameter renamed to indicate it may contain legacy "CommandOrControl" syntax
			// Legacy format: "CommandOrControl+Shift+R" → Modern format: "Command+Shift+R" (macOS) or "Control+Shift+R" (Windows/Linux)
			accelerator: legacyAcceleratorString,
		}: {
			command: Command;
			accelerator: Accelerator;
		}) => {
			// Convert legacy "CommandOrControl" syntax to platform-specific modifiers for backwards compatibility
			// This ensures users with old settings don't need to manually update their shortcuts
			const accelerator = legacyAcceleratorString.replace(
				'CommandOrControl',
				IS_MACOS ? 'Command' : 'Control',
			) as Accelerator;
			return desktopServices.globalShortcutManager.register({
				accelerator,
				callback: commandCallbacks[command.id],
				on: command.on,
			});
		},
	}),

	unregisterCommand: defineMutation({
		mutationKey: ['shortcuts', 'unregisterCommandGlobally'] as const,
		mutationFn: async ({ accelerator }: { accelerator: Accelerator }) => {
			return await desktopServices.globalShortcutManager.unregister(
				accelerator,
			);
		},
	}),

	unregisterAll: defineMutation({
		mutationKey: ['shortcuts', 'unregisterAllGlobalShortcuts'] as const,
		mutationFn: async () =>
			desktopServices.globalShortcutManager.unregisterAll(),
	}),
};
