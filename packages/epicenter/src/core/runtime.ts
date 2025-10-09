import type { StandardSchemaV1 } from '@standard-schema/spec';
import type * as Y from 'yjs';
import { createEpicenterDb, toRow } from '../db/core';
import type { TableHelper, YRow } from '../db/core';
import type { WorkspaceAction, WorkspaceActionMap } from './actions';
import type { Row, TableSchema, ValidatedRow } from './column-schemas';
import type { Index } from './indexes';
import { validateRow } from './validation';
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

	// 3. Set up observers for all tables (runtime-owned)
	const ytables = workspace.ydoc.getMap<Y.Map<YRow>>('tables');
	for (const tableName of Object.keys(workspace.tables)) {
		const ytable = ytables.get(tableName);
		if (!ytable) continue;

		// Narrow validated row type for this table using its schema
		const schema = workspace.tables[tableName];

		const observer = async (events: Y.YEvent<any>[]) => {
			for (const event of events) {
				event.changes.keys.forEach(async (change, key) => {
					if (change.action === 'add' || change.action === 'update') {
						const yrow = ytable.get(key);
						if (!yrow) return;
						const row = toRow(yrow);
						const result = validateRow(row, schema);
						if (result.status === 'valid') {
							for (const index of Object.values(indexes)) {
								const r =
									change.action === 'add'
										? await index.onAdd(tableName, key, result.row)
										: await index.onUpdate(tableName, key, result.row);
								if (r.error) {
									console.error(
										`Index ${change.action} failed for ${tableName}/${key}:`,
										r.error,
									);
								}
							}
						} else if (
							result.status === 'schema-mismatch' ||
							result.status === 'invalid-structure'
						) {
							console.warn(
								`Skipping invalid row in ${tableName}/${key} (${change.action}): ${result.status}`,
							);
						}
					} else if (change.action === 'delete') {
						for (const index of Object.values(indexes)) {
							const r = await index.onDelete(tableName, key);
							if (r.error) {
								console.error(
									`Index onDelete failed for ${tableName}/${key}:`,
									r.error,
								);
							}
						}
					}
				});
			}
		};

		// Deeply observe table changes
		ytable.observeDeep(observer);
	}

	// 4. Get table helpers from doc
	const tables = db.tables;

	// 5. Initialize dependencies (if any)
	const dependencies: Record<string, unknown> = {};

	// Process actions to extract handlers and make them directly callable
	const actionMap = workspace.actions({
		workspaces: dependencies,
		tables,
		indexes,
	}) as TActionMap;
	const processedActions = Object.entries(actionMap).reduce(
		(acc, [actionName, action]) => {
			(acc as any)[actionName] = action.handler;
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