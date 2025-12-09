import type { CopyFn } from '@epicenter/ui/copy-button';
import { rpc } from '$lib/query';

/**
 * Creates a copy function that uses the app's RPC layer with toast notifications.
 *
 * @param contentDescription - Description of what's being copied (e.g., "transcript", "API key")
 *                            Used in toast messages like "Copied {contentDescription} to clipboard!"
 *
 * @example
 * ```svelte
 * <CopyButton
 *   text={transcribedText}
 *   copyFn={createCopyFn('transcript')}
 * >
 *   <CopyIcon class="size-4" />
 * </CopyButton>
 * ```
 */
export function createCopyFn(contentDescription: string): CopyFn {
	return async (text: string) => {
		const { error } = await rpc.text.copyToClipboard.execute({ text });
		if (error) {
			await rpc.notify.error.execute({
				title: `Error copying ${contentDescription} to clipboard`,
				description: error.message,
				action: { type: 'more-details', error },
			});
			throw error;
		}
		await rpc.notify.success.execute({
			title: `Copied ${contentDescription} to clipboard!`,
			description: text,
		});
	};
}
