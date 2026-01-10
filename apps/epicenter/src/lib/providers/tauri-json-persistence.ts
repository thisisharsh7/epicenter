import type { ProviderExports } from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, writeFile } from '@tauri-apps/plugin-fs';
import type * as Y from 'yjs';

/**
 * Configuration options for JSON persistence.
 */
export type JsonPersistenceOptions = {
	/**
	 * Debounce delay in milliseconds before writing to disk.
	 * Prevents excessive writes during rapid Y.Doc updates.
	 *
	 * @default 500
	 */
	debounceMs?: number;
};

/**
 * Persist a Y.Doc as a JSON file for debugging and inspection.
 *
 * This is a **one-way mirror**: Y.Doc updates are serialized to JSON,
 * but changes to the JSON file are NOT loaded back into the Y.Doc.
 * Use this alongside `persistYDoc` for human-readable inspection of Y.Doc state.
 *
 * Features:
 * - Debounced writes to avoid disk thrashing on rapid updates
 * - Uses `ydoc.toJSON()` to serialize all shared types
 * - Pretty-printed JSON (2-space indent) for readability
 *
 * @param ydoc - The Y.Doc to mirror as JSON
 * @param pathSegments - Path segments relative to appLocalDataDir (should end in .json)
 * @param options - Configuration options
 * @returns Provider exports with `whenSynced` promise and `destroy` cleanup
 *
 * @example
 * ```typescript
 * // Use alongside binary persistence
 * const binaryPersistence = persistYDoc(ydoc, ['workspaces', workspaceId, 'head.yjs']);
 * const jsonPersistence = persistYDocAsJson(ydoc, ['workspaces', workspaceId, 'head.json']);
 *
 * // Both providers track their own sync state
 * await Promise.all([binaryPersistence.whenSynced, jsonPersistence.whenSynced]);
 *
 * // Clean up both when done
 * binaryPersistence.destroy();
 * jsonPersistence.destroy();
 * ```
 */
export function persistYDocAsJson(
	ydoc: Y.Doc,
	pathSegments: string[],
	options: JsonPersistenceOptions = {},
): ProviderExports {
	const { debounceMs = 500 } = options;

	// For logging - join segments with '/' for human-readable output
	const logPath = pathSegments.join('/');

	// Resolve paths once, cache the promise
	const pathsPromise = (async () => {
		const baseDir = await appLocalDataDir();
		const filePath = await join(baseDir, ...pathSegments);
		return { baseDir, filePath };
	})();

	// Debounce state
	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
	let pendingSave = false;

	// Save handler - debounced to avoid excessive writes
	const saveToJson = async () => {
		const { filePath } = await pathsPromise;
		try {
			// ydoc.toJSON() is deprecated but functional - perfect for inspection
			const json = ydoc.toJSON();
			const content = JSON.stringify(json, null, 2);
			await writeFile(filePath, new TextEncoder().encode(content));
		} catch (error) {
			console.error(`[JSON Persistence] Failed to save ${logPath}:`, error);
		}
	};

	const debouncedSave = () => {
		pendingSave = true;
		if (debounceTimeout !== null) {
			clearTimeout(debounceTimeout);
		}
		debounceTimeout = setTimeout(() => {
			debounceTimeout = null;
			pendingSave = false;
			saveToJson();
		}, debounceMs);
	};

	// Attach observer synchronously
	ydoc.on('update', debouncedSave);

	return {
		whenSynced: (async () => {
			const { filePath } = await pathsPromise;

			// Ensure parent directory exists
			const parentDir = await dirname(filePath);
			await mkdir(parentDir, { recursive: true }).catch(() => {
				// Directory might already exist - that's fine
			});

			// Write initial JSON state
			await saveToJson();
			console.log(`[JSON Persistence] Mirroring to ${logPath}`);
		})(),
		destroy() {
			ydoc.off('update', debouncedSave);

			// Clear any pending debounce
			if (debounceTimeout !== null) {
				clearTimeout(debounceTimeout);
				debounceTimeout = null;
			}

			// Flush any pending save synchronously (best effort)
			if (pendingSave) {
				// Fire and forget - we're destroying anyway
				saveToJson();
			}
		},
	};
}
