import type { ProviderExports } from '@epicenter/hq';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

/**
 * Persist a Y.Doc to a file path relative to appLocalDataDir.
 *
 * Uses Tauri's path APIs for cross-platform compatibility.
 * Returns a provider-compatible export with `whenSynced` and `destroy`.
 *
 * @example
 * ```typescript
 * const head = createHeadDoc({ workspaceId }).withProviders({
 *   persistence: (ctx) => persistYDoc(ctx.ydoc, 'workspaces/abc123/head.yjs'),
 * });
 * ```
 */
export async function persistYDoc(
	ydoc: Y.Doc,
	relativePath: string,
): Promise<ProviderExports> {
	const baseDir = await appLocalDataDir();

	// Use Tauri's join() for cross-platform path handling
	// Split by '/' and spread into join() to handle nested paths correctly
	const pathParts = relativePath.split('/');
	const filePath = await join(baseDir, ...pathParts);

	// Ensure parent directory exists
	if (pathParts.length > 1) {
		const parentParts = pathParts.slice(0, -1);
		const parentDir = await join(baseDir, ...parentParts);
		await mkdir(parentDir, { recursive: true }).catch(() => {
			// Directory might already exist - that's fine
		});
	}

	// Load existing state from disk
	let loadError: unknown = null;
	try {
		const savedState = await readFile(filePath);
		Y.applyUpdate(ydoc, new Uint8Array(savedState));
		console.log(`[Persistence] Loaded from ${relativePath}`);
	} catch (error) {
		// File doesn't exist yet - that's fine, we'll create it on first update
		loadError = error;
		console.log(`[Persistence] Creating new file at ${relativePath}`);
	}

	// Auto-save on updates
	const saveHandler = async () => {
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(filePath, state);
		} catch (error) {
			console.error(`[Persistence] Failed to save ${relativePath}:`, error);
		}
	};

	ydoc.on('update', saveHandler);

	// If this is a new file (load failed), save initial state
	if (loadError) {
		await saveHandler();
	}

	return {
		whenSynced: Promise.resolve(),
		destroy() {
			ydoc.off('update', saveHandler);
		},
	};
}
