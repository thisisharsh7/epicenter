import type { ProviderExports } from '@epicenter/hq';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

/**
 * Persist a Y.Doc to a file path relative to appLocalDataDir.
 *
 * Uses Tauri's path APIs for cross-platform compatibility.
 * Follows the sync-construction pattern: returns immediately with a
 * `whenSynced` promise that resolves when initial load is complete.
 *
 * @example
 * ```typescript
 * const persistence = persistYDoc(ydoc, 'workspaces/abc123/head.yjs');
 * await persistence.whenSynced; // Wait for initial load from disk
 * ```
 */
export function persistYDoc(
	ydoc: Y.Doc,
	relativePath: string,
): ProviderExports {
	// Track resolved file path (set during initialization)
	let filePath: string | null = null;

	// Async initialization - becomes whenSynced
	const whenSynced = (async () => {
		const baseDir = await appLocalDataDir();

		// Use Tauri's join() for cross-platform path handling
		const pathParts = relativePath.split('/');
		filePath = await join(baseDir, ...pathParts);

		// Ensure parent directory exists
		if (pathParts.length > 1) {
			const parentParts = pathParts.slice(0, -1);
			const parentDir = await join(baseDir, ...parentParts);
			await mkdir(parentDir, { recursive: true }).catch(() => {
				// Directory might already exist - that's fine
			});
		}

		// Load existing state from disk
		let isNewFile = false;
		try {
			const savedState = await readFile(filePath);
			Y.applyUpdate(ydoc, new Uint8Array(savedState));
			console.log(`[Persistence] Loaded from ${relativePath}`);
		} catch {
			// File doesn't exist yet - that's fine, we'll create it on first update
			isNewFile = true;
			console.log(`[Persistence] Creating new file at ${relativePath}`);
		}

		// If this is a new file, save initial state
		if (isNewFile) {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(filePath, state);
		}
	})();

	// Save handler - waits for initialization before saving
	const saveHandler = async () => {
		await whenSynced; // Ensure filePath is resolved
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(filePath!, state);
		} catch (error) {
			console.error(`[Persistence] Failed to save ${relativePath}:`, error);
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
