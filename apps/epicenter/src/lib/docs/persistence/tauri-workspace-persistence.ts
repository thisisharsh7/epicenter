import {
	defineExports,
	getWorkspaceDocMaps,
	type ProviderExports,
	readDefinitionFromYDoc,
} from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for the Tauri workspace persistence extension.
 */
export type TauriWorkspacePersistenceConfig = {
	/**
	 * The workspace ID (folder name under workspaces/).
	 */
	workspaceId: string;

	/**
	 * The epoch number for this workspace.
	 * Determines the subfolder for all persistence files.
	 */
	epoch: number;

	/**
	 * Debounce interval in milliseconds for JSON file writes.
	 * @default 500
	 */
	jsonDebounceMs?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// File Names
// ─────────────────────────────────────────────────────────────────────────────

const FILE_NAMES = {
	/** Full Y.Doc binary - sync source of truth */
	WORKSPACE_YJS: 'workspace.yjs',
	/** Schema metadata from Y.Map('definition') */
	DEFINITION_JSON: 'definition.json',
	/** Settings values from Y.Map('kv') */
	KV_JSON: 'kv.json',
	/** Snapshots directory */
	SNAPSHOTS_DIR: 'snapshots',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Tauri Workspace Persistence Extension
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unified workspace persistence extension for Tauri apps.
 *
 * Persists a workspace Y.Doc with multiple outputs:
 * - `workspace.yjs` - Full Y.Doc binary for sync
 * - `definition.json` - Human-readable schema (git-friendly)
 * - `kv.json` - Human-readable settings
 *
 * **Storage Layout:**
 * ```
 * {appLocalDataDir}/workspaces/{workspaceId}/{epoch}/
 * ├── workspace.yjs
 * ├── definition.json
 * ├── kv.json
 * └── snapshots/
 *     └── {unix-ms}.ysnap
 * ```
 *
 * Note: Unlike the Node.js version, this does NOT include SQLite persistence
 * since Tauri apps use a different approach for database access.
 *
 * @param ydoc - The Y.Doc to persist
 * @param config - Configuration with workspace ID and epoch
 * @returns Provider exports with `whenSynced` promise and `destroy` cleanup
 *
 * @example
 * ```typescript
 * const client = createClient(definition, {
 *   epoch,
 *   capabilities: {
 *     persistence: (ctx) => tauriWorkspacePersistence(ctx.ydoc, {
 *       workspaceId: definition.id,
 *       epoch,
 *     }),
 *   },
 * });
 * ```
 */
export function tauriWorkspacePersistence(
	ydoc: Y.Doc,
	config: TauriWorkspacePersistenceConfig,
): ProviderExports {
	const { workspaceId, epoch, jsonDebounceMs = 500 } = config;

	// For logging
	const logPath = `workspaces/${workspaceId}/${epoch}`;

	// Get the top-level Y.Maps
	const { definition: definitionMap, kv: kvMap } = getWorkspaceDocMaps(ydoc);

	// Resolve paths once, cache the promise
	const pathsPromise = (async () => {
		const baseDir = await appLocalDataDir();
		const epochDir = await join(
			baseDir,
			'workspaces',
			workspaceId,
			epoch.toString(),
		);
		const workspaceYjsPath = await join(epochDir, FILE_NAMES.WORKSPACE_YJS);
		const definitionJsonPath = await join(epochDir, FILE_NAMES.DEFINITION_JSON);
		const kvJsonPath = await join(epochDir, FILE_NAMES.KV_JSON);
		const snapshotsDir = await join(epochDir, FILE_NAMES.SNAPSHOTS_DIR);

		return {
			epochDir,
			workspaceYjsPath,
			definitionJsonPath,
			kvJsonPath,
			snapshotsDir,
		};
	})();

	// =========================================================================
	// 1. Y.Doc Binary Persistence (workspace.yjs)
	// =========================================================================

	const saveYDoc = async () => {
		const { workspaceYjsPath } = await pathsPromise;
		try {
			const state = Y.encodeStateAsUpdate(ydoc);
			await writeFile(workspaceYjsPath, state);
		} catch (error) {
			console.error(`[Persistence] Failed to save workspace.yjs:`, error);
		}
	};

	// Attach Y.Doc update handler
	ydoc.on('update', saveYDoc);

	// =========================================================================
	// 2. Definition JSON Persistence (definition.json)
	// =========================================================================

	let definitionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const saveDefinitionJson = async () => {
		const { definitionJsonPath } = await pathsPromise;
		try {
			const definition = readDefinitionFromYDoc(definitionMap);
			const json = JSON.stringify(definition, null, '\t');
			await writeFile(definitionJsonPath, new TextEncoder().encode(json));
			console.log(`[Persistence] Saved definition.json for ${workspaceId}`);
		} catch (error) {
			console.error(`[Persistence] Failed to save definition.json:`, error);
		}
	};

	const scheduleDefinitionSave = () => {
		if (definitionDebounceTimer) clearTimeout(definitionDebounceTimer);
		definitionDebounceTimer = setTimeout(async () => {
			definitionDebounceTimer = null;
			await saveDefinitionJson();
		}, jsonDebounceMs);
	};

	// Observe definition map changes
	const definitionObserverHandler = () => {
		scheduleDefinitionSave();
	};
	definitionMap.observeDeep(definitionObserverHandler);

	// =========================================================================
	// 3. KV JSON Persistence (kv.json)
	// =========================================================================

	let kvDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const saveKvJson = async () => {
		const { kvJsonPath } = await pathsPromise;
		try {
			const kvData: Record<string, unknown> = {};
			for (const [key, value] of kvMap.entries()) {
				kvData[key] = value;
			}
			const json = JSON.stringify(kvData, null, '\t');
			await writeFile(kvJsonPath, new TextEncoder().encode(json));
			console.log(`[Persistence] Saved kv.json for ${workspaceId}`);
		} catch (error) {
			console.error(`[Persistence] Failed to save kv.json:`, error);
		}
	};

	const scheduleKvSave = () => {
		if (kvDebounceTimer) clearTimeout(kvDebounceTimer);
		kvDebounceTimer = setTimeout(async () => {
			kvDebounceTimer = null;
			await saveKvJson();
		}, jsonDebounceMs);
	};

	// Observe KV map changes
	const kvObserverHandler = () => {
		scheduleKvSave();
	};
	kvMap.observe(kvObserverHandler);

	// =========================================================================
	// Return Provider Exports
	// =========================================================================

	return defineExports({
		whenSynced: (async () => {
			const { epochDir, workspaceYjsPath, snapshotsDir } = await pathsPromise;

			// Ensure directories exist
			const epochDirParent = await dirname(epochDir);
			await mkdir(epochDirParent, { recursive: true }).catch(() => {});
			await mkdir(epochDir, { recursive: true }).catch(() => {});
			await mkdir(snapshotsDir, { recursive: true }).catch(() => {});

			// Load existing Y.Doc state from disk
			let isNewFile = false;
			try {
				const savedState = await readFile(workspaceYjsPath);
				Y.applyUpdate(ydoc, new Uint8Array(savedState));
				console.log(`[Persistence] Loaded ${logPath}/workspace.yjs`);
			} catch {
				isNewFile = true;
				console.log(`[Persistence] Creating new ${logPath}/workspace.yjs`);
			}

			// Save initial state if new file
			if (isNewFile) {
				await saveYDoc();
			}

			// Initial JSON saves
			await saveDefinitionJson();
			await saveKvJson();
		})(),

		destroy() {
			// Clear debounce timers
			if (definitionDebounceTimer) {
				clearTimeout(definitionDebounceTimer);
				definitionDebounceTimer = null;
			}
			if (kvDebounceTimer) {
				clearTimeout(kvDebounceTimer);
				kvDebounceTimer = null;
			}

			// Remove Y.Doc observer
			ydoc.off('update', saveYDoc);

			// Remove map observers
			definitionMap.unobserveDeep(definitionObserverHandler);
			kvMap.unobserve(kvObserverHandler);
		},
	});
}
