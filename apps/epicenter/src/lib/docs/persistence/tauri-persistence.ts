import { defineExports, type ProviderExports } from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

/**
 * Configuration options for Tauri persistence.
 */
export type TauriPersistenceConfig = {
	/**
	 * Debounce delay in milliseconds before writing the JSON mirror to disk.
	 * The binary .yjs file is always saved immediately on every update.
	 *
	 * @default 500
	 */
	jsonDebounceMs?: number;
};

/**
 * Persist a Y.Doc to disk with both binary and JSON formats.
 *
 * This is the standard persistence provider for Tauri apps. It creates two files:
 *
 * 1. **Binary (.yjs)**: The source of truth for Y.Doc state
 *    - Saved immediately on every Y.Doc update
 *    - Loaded on startup to restore state
 *    - Compact binary format for efficient sync
 *
 * 2. **JSON (.json)**: A human-readable mirror for debugging
 *    - Debounced writes (default 500ms) to avoid disk thrashing
 *    - One-way mirror only (changes to JSON are NOT loaded back)
 *    - Uses `ydoc.toJSON()` to serialize all shared types
 *    - Pretty-printed with tabs for readability
 *
 * Path segments are joined using Tauri's path APIs, ensuring correct separators
 * on all platforms (Windows backslashes, Unix forward slashes).
 *
 * @param ydoc - The Y.Doc to persist
 * @param pathSegments - Path segments relative to appLocalDataDir (WITHOUT file extension)
 * @param config - Optional configuration
 * @returns Provider exports with `whenSynced` promise and `destroy` cleanup
 *
 * @example
 * ```typescript
 * // Creates both registry.yjs and registry.json
 * const persistence = tauriPersistence(ydoc, ['registry']);
 * await persistence.whenSynced;
 *
 * // For nested paths: creates workspaces/abc/head.yjs and head.json
 * const headPersistence = tauriPersistence(ydoc, ['workspaces', workspaceId, 'head']);
 * ```
 *
 * @example
 * ```typescript
 * // In a provider factory
 * import { createRegistryDoc } from '$lib/docs/core/registry-doc';
 *
 * const registry = createRegistryDoc({
 *   providers: {
 *     persistence: ({ ydoc }) => tauriPersistence(ydoc, ['registry']),
 *   },
 * });
 * ```
 */
export function tauriPersistence(
	ydoc: Y.Doc,
	pathSegments: string[],
	config: TauriPersistenceConfig = {},
): ProviderExports {
	const { jsonDebounceMs = 500 } = config;

	// For logging - join segments with '/' for human-readable output
	const logPath = pathSegments.join('/');

	// Resolve paths once, cache the promise
	const pathsPromise = (async () => {
		const baseDir = await appLocalDataDir();
		const basePath = await join(baseDir, ...pathSegments);
		return {
			baseDir,
			binaryPath: `${basePath}.yjs`,
			jsonPath: `${basePath}.json`,
		};
	})();

	// =========================================================================
	// Binary Persistence (.yjs) - Immediate saves, source of truth
	// =========================================================================

	const saveBinary = async () => {
		const { binaryPath } = await pathsPromise;
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(binaryPath, state);
		} catch (error) {
			console.error(`[Persistence] Failed to save ${logPath}.yjs:`, error);
		}
	};

	// =========================================================================
	// JSON Mirror (.json) - Debounced saves, human-readable
	// =========================================================================

	let jsonDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingJsonSave = false;

	const saveJson = async () => {
		const { jsonPath } = await pathsPromise;
		try {
			const json = ydoc.toJSON();
			const content = JSON.stringify(json, null, '\t');
			await writeFile(jsonPath, new TextEncoder().encode(content));
		} catch (error) {
			console.error(`[Persistence] Failed to save ${logPath}.json:`, error);
		}
	};

	const scheduleJsonSave = () => {
		pendingJsonSave = true;
		if (jsonDebounceTimer !== null) {
			clearTimeout(jsonDebounceTimer);
		}
		jsonDebounceTimer = setTimeout(() => {
			jsonDebounceTimer = null;
			pendingJsonSave = false;
			saveJson();
		}, jsonDebounceMs);
	};

	// =========================================================================
	// Combined Update Handler
	// =========================================================================

	const handleUpdate = () => {
		saveBinary(); // Immediate
		scheduleJsonSave(); // Debounced
	};

	// Attach observer synchronously
	ydoc.on('update', handleUpdate);

	// =========================================================================
	// Provider Exports
	// =========================================================================

	return defineExports({
		whenSynced: (async () => {
			const { binaryPath, jsonPath } = await pathsPromise;

			// Ensure parent directory exists
			const parentDir = await dirname(binaryPath);
			await mkdir(parentDir, { recursive: true }).catch(() => {
				// Directory might already exist - that's fine
			});

			// Load existing state from binary file
			let isNewFile = false;
			try {
				const savedState = await readFile(binaryPath);
				Y.applyUpdate(ydoc, new Uint8Array(savedState));
				console.log(`[Persistence] Loaded ${logPath}.yjs`);
			} catch {
				// File doesn't exist yet - that's fine, we'll create it
				isNewFile = true;
				console.log(`[Persistence] Creating new ${logPath}.yjs`);
			}

			// Save initial state if new file
			if (isNewFile) {
				await saveBinary();
			}

			// Always write initial JSON mirror
			await saveJson();
			console.log(`[Persistence] Mirroring to ${logPath}.json`);
		})(),

		destroy() {
			// Remove update handler
			ydoc.off('update', handleUpdate);

			// Clear JSON debounce timer
			if (jsonDebounceTimer !== null) {
				clearTimeout(jsonDebounceTimer);
				jsonDebounceTimer = null;
			}

			// Flush any pending JSON save (best effort, fire and forget)
			if (pendingJsonSave) {
				saveJson();
			}
		},
	});
}
