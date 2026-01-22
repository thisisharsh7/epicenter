import type { KvDefinitionMap, TableDefinitionMap } from '@epicenter/hq';
import {
	defineExports,
	type ExtensionContext,
	type ProviderExports,
} from '@epicenter/hq';
import { appLocalDataDir, dirname, join } from '@tauri-apps/api/path';
import { mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs';
import * as Y from 'yjs';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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
	/** Schema metadata from Y.Map('schema') */
	SCHEMA_JSON: 'schema.json',
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
 * 2. **Schema JSON (schema.json)**: Human-readable table/KV schemas
 *    - Extracted from Y.Map('schema')
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
 * ├── schema.json
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
 *   .withSchema(schema)
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
	const { ydoc, workspaceId, epoch, schema } = ctx;
	const { jsonDebounceMs = 500 } = config;

	// For logging
	const logPath = `workspaces/${workspaceId}/${epoch}`;

	// Get the top-level Y.Maps directly from ydoc (stable references)
	const schemaMap = ydoc.getMap('schema');
	const kvMap = ydoc.getMap('kv');

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
		const schemaJsonPath = await join(epochDir, FILE_NAMES.SCHEMA_JSON);
		const kvJsonPath = await join(epochDir, FILE_NAMES.KV_JSON);
		const snapshotsDir = await join(epochDir, FILE_NAMES.SNAPSHOTS_DIR);

		return {
			epochDir,
			workspaceYjsPath,
			schemaJsonPath,
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
	// 2. Schema JSON Persistence (schema.json)
	// =========================================================================

	let schemaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const saveSchemaJson = async () => {
		const { schemaJsonPath } = await pathsPromise;
		try {
			const schemaSnapshot = schema.get();
			const json = JSON.stringify(schemaSnapshot, null, '\t');
			await writeFile(schemaJsonPath, new TextEncoder().encode(json));
			console.log(
				`[WorkspacePersistence] Saved schema.json for ${workspaceId}`,
			);
		} catch (error) {
			console.error(
				`[WorkspacePersistence] Failed to save schema.json:`,
				error,
			);
		}
	};

	const scheduleSchemaSave = () => {
		if (schemaDebounceTimer) clearTimeout(schemaDebounceTimer);
		schemaDebounceTimer = setTimeout(async () => {
			schemaDebounceTimer = null;
			await saveSchemaJson();
		}, jsonDebounceMs);
	};

	// Observe schema map changes
	const schemaObserverHandler = () => {
		scheduleSchemaSave();
	};
	schemaMap.observeDeep(schemaObserverHandler);

	// =========================================================================
	// 3. KV JSON Persistence (kv.json)
	// =========================================================================

	let kvDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	const saveKvJson = async () => {
		const { kvJsonPath } = await pathsPromise;
		try {
			const kvData = kvMap.toJSON();
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
			await saveSchemaJson();
			await saveKvJson();
		})(),

		destroy() {
			// Clear debounce timers
			if (schemaDebounceTimer) {
				clearTimeout(schemaDebounceTimer);
				schemaDebounceTimer = null;
			}
			if (kvDebounceTimer) {
				clearTimeout(kvDebounceTimer);
				kvDebounceTimer = null;
			}

			// Remove Y.Doc observer
			ydoc.off('update', saveYDoc);

			// Remove map observers
			schemaMap.unobserveDeep(schemaObserverHandler);
			kvMap.unobserve(kvObserverHandler);
		},
	});
}
