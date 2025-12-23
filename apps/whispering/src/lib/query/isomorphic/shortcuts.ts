import { type Command, commandCallbacks } from '$lib/commands';
import type { KeyboardEventSupportedKey } from '$lib/constants/keyboard';
import { localShortcutManager } from '$lib/services/isomorphic';
import type { CommandId } from '$lib/services/isomorphic';
import { defineMutation } from '../_client';

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
			localShortcutManager.register({
				id: command.id as CommandId,
				keyCombination,
				callback: commandCallbacks[command.id],
				on: command.on,
			}),
	}),

	unregisterCommand: defineMutation({
		mutationKey: ['shortcuts', 'unregisterCommandLocally'] as const,
		mutationFn: async ({ commandId }: { commandId: CommandId }) =>
			localShortcutManager.unregister(commandId),
	}),
};
