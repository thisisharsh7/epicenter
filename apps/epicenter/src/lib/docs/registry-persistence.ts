import { defineExports, type ProviderExports } from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

/**
 * Configuration options for registry persistence.
 */
export type RegistryPersistenceConfig = {
	/**
	 * Debounce delay in milliseconds before writing the JSON mirror to disk.
	 * The binary .yjs file is always saved immediately on every update.
	 *
	 * @default 500
	 */
	jsonDebounceMs?: number;
};

/**
 * Persist the registry Y.Doc to disk with both binary and JSON formats.
 *
 * This is the persistence provider for the registry document. It creates two files:
 *
 * 1. **Binary (registry.yjs)**: The source of truth for Y.Doc state
 *    - Saved immediately on every Y.Doc update
 *    - Loaded on startup to restore state
 *    - Compact binary format for efficient sync
 *
 * 2. **JSON (registry.json)**: A human-readable mirror for debugging
 *    - Debounced writes (default 500ms) to avoid disk thrashing
 *    - One-way mirror only (changes to JSON are NOT loaded back)
 *    - Uses `ydoc.toJSON()` to serialize all shared types
 *    - Pretty-printed with tabs for readability
 *
 * @param ydoc - The Y.Doc to persist
 * @param config - Optional configuration
 * @returns Provider exports with `whenSynced` promise and `destroy` cleanup
 *
 * @example
 * ```typescript
 * const baseRegistry = createRegistryDoc({
 *   providers: {
 *     persistence: ({ ydoc }) => registryPersistence(ydoc),
 *   },
 * });
 * ```
 */
export function registryPersistence(
	ydoc: Y.Doc,
	config: RegistryPersistenceConfig = {},
): ProviderExports {
	const { jsonDebounceMs = 500 } = config;

	// Resolve paths once, cache the promise
	const pathsPromise = (async () => {
		const baseDir = await appLocalDataDir();
		const binaryPath = await join(baseDir, 'registry.yjs');
		const jsonPath = await join(baseDir, 'registry.json');
		return { baseDir, binaryPath, jsonPath };
	})();

	// =========================================================================
	// Binary Persistence (registry.yjs) - Immediate saves, source of truth
	// =========================================================================

	const saveBinary = async () => {
		const { binaryPath } = await pathsPromise;
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(binaryPath, state);
		} catch (error) {
			console.error(
				`[RegistryPersistence] Failed to save registry.yjs:`,
				error,
			);
		}
	};

	// =========================================================================
	// JSON Mirror (registry.json) - Debounced saves, human-readable
	// =========================================================================

	let jsonDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingJsonSave = false;

	const saveJson = async () => {
		const { jsonPath } = await pathsPromise;
		try {
			// Access the workspaces map directly instead of deprecated ydoc.toJSON()
			const workspacesMap = ydoc.getMap<true>('workspaces');
			const json = {
				workspaces: workspacesMap.toJSON(),
			};
			const content = JSON.stringify(json, null, '\t');
			await writeFile(jsonPath, new TextEncoder().encode(content));
		} catch (error) {
			console.error(
				`[RegistryPersistence] Failed to save registry.json:`,
				error,
			);
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
			const { binaryPath } = await pathsPromise;

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
				console.log(`[RegistryPersistence] Loaded registry.yjs`);
			} catch {
				// File doesn't exist yet - that's fine, we'll create it
				isNewFile = true;
				console.log(`[RegistryPersistence] Creating new registry.yjs`);
			}

			// Save initial state if new file
			if (isNewFile) {
				await saveBinary();
			}

			// Always write initial JSON mirror
			await saveJson();
			console.log(`[RegistryPersistence] Mirroring to registry.json`);
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
