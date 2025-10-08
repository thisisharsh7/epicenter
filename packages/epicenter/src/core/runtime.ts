import type { StandardSchemaV1 } from '@standard-schema/spec';
import type * as Y from 'yjs';
import { createEpicenterDb } from '../db/core';
import type { TableHelper } from '../db/core';
import type { WorkspaceAction, WorkspaceActionMap } from './actions';
import type { TableSchema, ValidatedRow } from './column-schemas';
import type { Index } from './indexes';
import type { Workspace } from './workspace';

/**
 * Runtime configuration provided by the user
 *
 * ## Workspace File Structure
 *
 * Workspaces use a `.epicenter/` folder for all system-managed data:
 *
 * ```
 * workspace-root/
 *   epicenter.config.ts       # Workspace definition
 *
 *   .epicenter/               # System-managed folder (auto-created)
 *     assets/                 # Binary blobs (audio, video, images)
 *                            # Referenced by YJS data, not directly edited by users
 *                            # Example: audio files in a transcription app
 *
 *     indexes/                # Index storage (SQLite DBs, vector DBs, etc.)
 *                            # Synchronized snapshots for querying
 *                            # Can be rebuilt from YJS document
 *
 *     ydoc.bin                # YJS document persistence file
 *                            # Source of truth for all structured data
 *
 *     .gitignore              # Auto-generated, typically ignores:
 *                            # - assets/ (large binaries)
 *                            # - indexes/ (rebuildable)
 *                            # - ydoc.bin (depends on sync strategy)
 * ```
 *
 * ## Assets
 *
 * Binary files (audio, video, images) are stored in `.epicenter/assets/` and referenced
 * by structured data in the YJS document. These are app-managed blobs that users interact
 * with through the application, not directly through the file system.
 *
 * Example: In a transcription app, audio recordings are stored as blobs in `assets/` while
 * the recording metadata (title, date, duration) lives in YJS tables that reference these files
 * by path (e.g., `.epicenter/assets/rec-001.mp3`).
 *
 * ## Indexes
 *
 * Indexes are synchronized snapshots of YJS data optimized for different query patterns.
 * They live in `.epicenter/indexes/` and can be rebuilt from the YJS document, so they
 * are typically gitignored.
 *
 * ## YJS Persistence
 *
 * The `ydoc.bin` file persists the YJS document to disk. This is the source of truth for
 * all structured data in the workspace. Whether to gitignore this depends on your sync
 * strategy (local-only vs. collaborative).
 *
 * ## Future Configuration Options
 *
 * Currently, RuntimeConfig is empty. Future options may include:
 * - YJS persistence strategies (filesystem, IndexedDB, remote sync)
 * - Custom asset storage locations
 * - Index rebuild strategies
 * - Collaboration providers
 */
export type RuntimeConfig = {
	// Empty for now - configuration will be added as needed
};

/**
 * Resolved runtime instance returned from runWorkspace
 * Combines typed table helpers and extracted action handlers.
 */
export type WorkspaceRuntime<
	TTableSchemas extends Record<string, TableSchema>,
	TActionMap extends WorkspaceActionMap,
> = {
	[TableName in keyof TTableSchemas]: TableHelper<
		ValidatedRow<TTableSchemas[TableName]>
	>;
} & {
	[K in keyof TActionMap]: TActionMap[K]['handler'];
} & {
	indexes: Record<string, Index>;
	ydoc: Y.Doc;
	transact: (fn: () => void, origin?: string) => void;
};

/**
 * Run a workspace with YJS-first architecture
 * Returns the workspace instance with tables, actions, and indexes
 */
export async function runWorkspace<
	TTableSchemas extends Record<string, TableSchema>,
	TActionMap extends WorkspaceActionMap,
	TDeps extends Record<string, Workspace>,
>(
	workspace: Workspace<TTableSchemas, TActionMap, TDeps>,
	config: RuntimeConfig = {},
): Promise<WorkspaceRuntime<TTableSchemas, TActionMap>> {
	// 1. Initialize Epicenter database
	const db = createEpicenterDb(workspace.ydoc, workspace.tables);

	// 2. Initialize indexes
	const indexes = workspace.indexes({
		db,
		tableSchemas: workspace.tables,
		workspaceId: workspace.ydoc.guid,
	});

	// Initialize each index
	for (const [indexName, index] of Object.entries(indexes)) {
		try {
			await index.init?.();
		} catch (error) {
			console.error(`Failed to initialize index "${indexName}":`, error);
		}
	}

	// 3. Set up observers for all tables
	for (const tableName of Object.keys(workspace.tables)) {
		db.tables[tableName].observe({
			onAdd: async (id, data) => {
				for (const index of Object.values(indexes)) {
					const result = await index.onAdd(tableName, id, data);
					if (result.error) {
						console.error(
							`Index onAdd failed for ${tableName}/${id}:`,
							result.error,
						);
					}
				}
			},
			onUpdate: async (id, data) => {
				for (const index of Object.values(indexes)) {
					const result = await index.onUpdate(tableName, id, data);
					if (result.error) {
						console.error(
							`Index onUpdate failed for ${tableName}/${id}:`,
							result.error,
						);
					}
				}
			},
			onDelete: async (id) => {
				for (const index of Object.values(indexes)) {
					const result = await index.onDelete(tableName, id);
					if (result.error) {
						console.error(
							`Index onDelete failed for ${tableName}/${id}:`,
							result.error,
						);
					}
				}
			},
		});
	}

	// 4. Get table helpers from doc
	const tables = db.tables;

	// 5. Initialize dependencies (if any)
	const dependencies: Record<string, unknown> = {};
	// TODO: Handle dependencies

	// 6. Initialize actions with full context
	const actionContext = {
		workspaces: dependencies,
		tables,
		indexes,
	};

	// Process actions to extract handlers and make them directly callable
	const actionMap = workspace.actions(actionContext) as TActionMap;
	const processedActions = Object.entries(actionMap).reduce(
		(acc, [actionName, action]) => {
			(acc as any)[actionName] = (action as WorkspaceAction<any, any>).handler;
			return acc;
		},
		{} as { [K in keyof TActionMap]: TActionMap[K]['handler'] },
	);

	// 7. Return workspace instance
	const workspaceInstance = {
		...tables,
		...processedActions,
		indexes,
		ydoc: db.ydoc,
		transact: (fn: () => void, origin?: string) => db.transact(fn, origin),
	} satisfies WorkspaceRuntime<TTableSchemas, TActionMap>;

	return workspaceInstance;
}
