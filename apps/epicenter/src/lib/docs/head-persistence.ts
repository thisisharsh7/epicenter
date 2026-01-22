import { defineExports, type ProviderExports } from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

/**
 * Configuration options for head persistence.
 */
export type HeadPersistenceConfig = {
	/**
	 * Debounce delay in milliseconds before writing the JSON mirror to disk.
	 * The binary .yjs file is always saved immediately on every update.
	 *
	 * @default 500
	 */
	jsonDebounceMs?: number;
};

/**
 * Persist the head Y.Doc to disk with both binary and JSON formats.
 *
 * This is the persistence provider for head documents. It creates two files:
 *
 * 1. **Binary (head.yjs)**: The source of truth for Y.Doc state
 *    - Saved immediately on every Y.Doc update
 *    - Loaded on startup to restore state
 *    - Compact binary format for efficient sync
 *
 * 2. **JSON (head.json)**: A human-readable mirror for debugging
 *    - Debounced writes (default 500ms) to avoid disk thrashing
 *    - One-way mirror only (changes to JSON are NOT loaded back)
 *    - **Flattens `meta` map to top-level keys** for cleaner output
 *    - Pretty-printed with tabs for readability
 *
 * **JSON Output Format**:
 * ```json
 * {
 *   "name": "My Workspace",
 *   "icon": null,
 *   "description": "...",
 *   "epochs": {
 *     "client123": 0,
 *     "client456": 1
 *   }
 * }
 * ```
 *
 * Note: The `meta` map contents (name, icon, description) are flattened to
 * top-level keys, while `epochs` remains as-is.
 *
 * @param ydoc - The Y.Doc to persist (uses ydoc.guid as workspace ID)
 * @param config - Optional configuration
 * @returns Provider exports with `whenSynced` promise and `destroy` cleanup
 *
 * @example
 * ```typescript
 * const baseHead = createHeadDoc({
 *   workspaceId,
 *   providers: {
 *     persistence: ({ ydoc }) => headPersistence(ydoc),
 *   },
 * });
 * ```
 */
export function headPersistence(
	ydoc: Y.Doc,
	config: HeadPersistenceConfig = {},
): ProviderExports {
	const { jsonDebounceMs = 500 } = config;

	// The Y.Doc guid is the workspace ID (set by createHeadDoc)
	const workspaceId = ydoc.guid;

	// Resolve paths once, cache the promise
	const pathsPromise = (async () => {
		const baseDir = await appLocalDataDir();
		const workspaceDir = await join(baseDir, 'workspaces', workspaceId);
		const binaryPath = await join(workspaceDir, 'head.yjs');
		const jsonPath = await join(workspaceDir, 'head.json');
		return { workspaceDir, binaryPath, jsonPath };
	})();

	// =========================================================================
	// Binary Persistence (head.yjs) - Immediate saves, source of truth
	// =========================================================================

	const saveBinary = async () => {
		const { binaryPath } = await pathsPromise;
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(binaryPath, state);
		} catch (error) {
			console.error(
				`[HeadPersistence] Failed to save head.yjs for ${workspaceId}:`,
				error,
			);
		}
	};

	// =========================================================================
	// JSON Mirror (head.json) - Debounced saves, human-readable, flattened meta
	// =========================================================================

	let jsonDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingJsonSave = false;

	const saveJson = async () => {
		const { jsonPath } = await pathsPromise;
		try {
			// Get raw Y.Doc JSON
			const raw = ydoc.toJSON() as {
				meta?: Record<string, unknown>;
				epochs?: Record<string, number>;
			};

			// Flatten: spread meta contents to top level, keep epochs as-is
			const { meta, epochs, ...rest } = raw;
			const flattened = {
				...rest,
				...(meta ?? {}),
				epochs: epochs ?? {},
			};

			const content = JSON.stringify(flattened, null, '\t');
			await writeFile(jsonPath, new TextEncoder().encode(content));
		} catch (error) {
			console.error(
				`[HeadPersistence] Failed to save head.json for ${workspaceId}:`,
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
			const { workspaceDir, binaryPath } = await pathsPromise;

			// Ensure parent directory exists
			await mkdir(workspaceDir, { recursive: true }).catch(() => {
				// Directory might already exist - that's fine
			});

			// Load existing state from binary file
			let isNewFile = false;
			try {
				const savedState = await readFile(binaryPath);
				Y.applyUpdate(ydoc, new Uint8Array(savedState));
				console.log(`[HeadPersistence] Loaded head.yjs for ${workspaceId}`);
			} catch {
				// File doesn't exist yet - that's fine, we'll create it
				isNewFile = true;
				console.log(
					`[HeadPersistence] Creating new head.yjs for ${workspaceId}`,
				);
			}

			// Save initial state if new file
			if (isNewFile) {
				await saveBinary();
			}

			// Always write initial JSON mirror
			await saveJson();
			console.log(
				`[HeadPersistence] Mirroring to head.json for ${workspaceId}`,
			);
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
