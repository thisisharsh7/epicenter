import { type Command, commandCallbacks } from '$lib/commands';
import type { KeyboardEventSupportedKey } from '$lib/constants/keyboard';
import { services, type CommandId } from '$lib/services';
import { defineMutation } from '../client';

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
