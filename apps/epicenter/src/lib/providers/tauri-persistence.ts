import type { ProviderExports } from '@epicenter/hq';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

/**
 * Persist a Y.Doc to a file path relative to appLocalDataDir.
 *
 * Accepts path segments as an array for explicit cross-platform path handling.
 * Segments are joined using Tauri's path APIs, ensuring correct separators
 * on all platforms (Windows backslashes, Unix forward slashes).
 *
 * Follows the sync-construction pattern: returns immediately with a
 * `whenSynced` promise that resolves when initial load is complete.
 *
 * @param ydoc - The Y.Doc to persist
 * @param pathSegments - Path segments relative to appLocalDataDir
 * @returns Provider exports with `whenSynced` promise and `destroy` cleanup
 *
 * @example
 * ```typescript
 * const persistence = persistYDoc(ydoc, ['workspaces', workspaceId, 'head.yjs']);
 * await persistence.whenSynced; // Wait for initial load from disk
 *
 * // Clean up when done
 * persistence.destroy();
 * ```
 */
export function persistYDoc(
	ydoc: Y.Doc,
	pathSegments: string[],
): ProviderExports {
	// For logging - join segments with '/' for human-readable output
	const logPath = pathSegments.join('/');

	// Resolve paths once, cache the promise
	const pathsPromise = (async () => {
		const baseDir = await appLocalDataDir();
		const filePath = await join(baseDir, ...pathSegments);
		return { baseDir, filePath };
	})();

	// Async initialization - becomes whenSynced
	const whenSynced = (async () => {
		const { baseDir, filePath } = await pathsPromise;

		// Ensure parent directory exists
		if (pathSegments.length > 1) {
			const parentSegments = pathSegments.slice(0, -1);
			const parentDir = await join(baseDir, ...parentSegments);
			await mkdir(parentDir, { recursive: true }).catch(() => {
				// Directory might already exist - that's fine
			});
		}

		// Load existing state from disk
		let isNewFile = false;
		try {
			const savedState = await readFile(filePath);
			Y.applyUpdate(ydoc, new Uint8Array(savedState));
			console.log(`[Persistence] Loaded from ${logPath}`);
		} catch {
			// File doesn't exist yet - that's fine, we'll create it on first update
			isNewFile = true;
			console.log(`[Persistence] Creating new file at ${logPath}`);
		}

		// If this is a new file, save initial state
		if (isNewFile) {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(filePath, state);
		}
	})();

	// Save handler - waits for initialization before saving
	const saveHandler = async () => {
		const { filePath } = await pathsPromise;
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(filePath, state);
		} catch (error) {
			console.error(`[Persistence] Failed to save ${logPath}:`, error);
		}
	};

	// Attach observer synchronously - saves will queue until whenSynced resolves
	ydoc.on('update', saveHandler);

	return {
		whenSynced,
		destroy() {
			ydoc.off('update', saveHandler);
		},
	};
}
