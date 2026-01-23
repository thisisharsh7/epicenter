import type { KvDefinitionMap, TableDefinitionMap } from '@epicenter/hq';
import {
	defineExports,
	type ExtensionContext,
	type ProviderExports,
} from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

/**
 * Configuration for the workspace persistence extension.
 */
export type WorkspacePersistenceConfig = {
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
	/** Definition metadata from Y.Map('definition') */
	DEFINITION_JSON: 'definition.json',
	/** Settings values from Y.Map('kv') */
	KV_JSON: 'kv.json',
	/** Snapshots directory */
	SNAPSHOTS_DIR: 'snapshots',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Persistence Extension
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a workspace Y.Doc to disk with multiple outputs.
 *
 * This is the persistence provider for workspace documents. It creates:
 *
 * 1. **Binary (workspace.yjs)**: The source of truth for Y.Doc state
 *    - Saved immediately on every Y.Doc update
 *    - Loaded on startup to restore state
 *
 * 2. **Definition JSON (definition.json)**: Human-readable table/KV definitions
 *    - Extracted from Y.Map('definition')
 *    - Debounced writes (default 500ms)
 *    - Git-friendly for version control
 *
 * 3. **KV JSON (kv.json)**: Human-readable settings
 *    - Extracted from Y.Map('kv')
 *    - Debounced writes (default 500ms)
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
 * Note: Workspace identity (name, icon, description) lives in Head Doc's
 * Y.Map('meta'), not in the Workspace Doc.
 *
 * @param ctx - The extension context
 * @param config - Optional configuration for debounce timing
 * @returns Provider exports with `whenSynced` promise and `destroy` cleanup
 *
 * @example
 * ```typescript
 * const client = createClient(head)
 *   .withDefinition(schema)
 *   .withExtensions({
 *     persistence: (ctx) => workspacePersistence(ctx),
 *   });
 * ```
 */
export function workspacePersistence<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(
	ctx: ExtensionContext<TTableDefinitionMap, TKvDefinitionMap>,
	config: WorkspacePersistenceConfig = {},
): ProviderExports {
	const { ydoc, workspaceId, epoch, definition, kv } = ctx;
	const { jsonDebounceMs = 500 } = config;

	// For logging
	const logPath = `workspaces/${workspaceId}/${epoch}`;

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
			console.error(
				`[WorkspacePersistence] Failed to save workspace.yjs:`,
				error,
			);
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
			const definitionSnapshot = definition.get();
			const json = JSON.stringify(definitionSnapshot, null, '\t');
			await writeFile(definitionJsonPath, new TextEncoder().encode(json));
			console.log(
				`[WorkspacePersistence] Saved definition.json for ${workspaceId}`,
			);
		} catch (error) {
			console.error(
				`[WorkspacePersistence] Failed to save definition.json:`,
				error,
			);
		}
	};

	const scheduleDefinitionSave = () => {
		if (definitionDebounceTimer) clearTimeout(definitionDebounceTimer);
		definitionDebounceTimer = setTimeout(async () => {
			definitionDebounceTimer = null;
			await saveDefinitionJson();
		}, jsonDebounceMs);
	};

	// Observe definition changes using the definition helper's observe method
	const unsubscribeDefinition = definition.observe(scheduleDefinitionSave);

	// =========================================================================
	// 3. KV JSON Persistence (kv.json)
	// =========================================================================

	let kvDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const saveKvJson = async () => {
		const { kvJsonPath } = await pathsPromise;
		try {
			const kvData = kv.toJSON();
			const json = JSON.stringify(kvData, null, '\t');
			await writeFile(kvJsonPath, new TextEncoder().encode(json));
			console.log(`[WorkspacePersistence] Saved kv.json for ${workspaceId}`);
		} catch (error) {
			console.error(`[WorkspacePersistence] Failed to save kv.json:`, error);
		}
	};

	const scheduleKvSave = () => {
		if (kvDebounceTimer) clearTimeout(kvDebounceTimer);
		kvDebounceTimer = setTimeout(async () => {
			kvDebounceTimer = null;
			await saveKvJson();
		}, jsonDebounceMs);
	};

	// Observe KV changes using the kv helper's observe method
	const unsubscribeKv = kv.observe(scheduleKvSave);

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
				console.log(`[WorkspacePersistence] Loaded ${logPath}/workspace.yjs`);
			} catch {
				isNewFile = true;
				console.log(
					`[WorkspacePersistence] Creating new ${logPath}/workspace.yjs`,
				);
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

			// Remove map observers via unsubscribe functions
			unsubscribeDefinition();
			unsubscribeKv();
		},
	});
}
