import type { StandardSchemaV1 } from '@standard-schema/spec';
import { createEpicenterDb } from '../db/core';
import type { TableHelper } from '../db/core';
import type { WorkspaceAction, WorkspaceActionMap } from './actions';
import type { TableSchema, ValidatedRow } from './column-schemas';
import type { Index } from './indexes';
import type { IndexesAPI, Workspace } from './workspace';

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
	TSchema extends Record<string, TableSchema>,
	TActionMap extends WorkspaceActionMap,
	TIndexes extends Record<string, Index<TSchema>> = Record<
		string,
		Index<TSchema>
	>,
> = {
	[TableName in keyof TSchema]: TableHelper<ValidatedRow<TSchema[TableName]>>;
} & {
	[K in keyof TActionMap]: TActionMap[K]['handler'];
} & {
	indexes: IndexesAPI<TIndexes>;
	ydoc: Y.Doc;
	transact: (fn: () => void, origin?: string) => void;
};

/**
 * Run a workspace with YJS-first architecture
 * Returns the workspace instance with tables, actions, and indexes
 */
export async function runWorkspace<
	TId extends string,
	TSchema extends Record<string, TableSchema>,
	TActionMap extends WorkspaceActionMap,
	TDeps extends readonly Workspace[],
	TIndexes extends Record<string, Index<TSchema>>,
>(
	workspace: Workspace<TId, TSchema, TActionMap, TDeps, TIndexes>,
	config: RuntimeConfig = {},
): Promise<WorkspaceRuntime<TSchema, TActionMap, TIndexes>> {
	// 1. Initialize Epicenter database
	const db = createEpicenterDb(workspace.ydoc, workspace.schema);

	// 2. Call index functions with db to set up observers and get results
	const indexFunctions = workspace.indexes({ db });
	const indexes: Record<string, { destroy: () => void | Promise<void>; queries: any }> = {};

	for (const [indexName, indexFn] of Object.entries(indexFunctions)) {
		try {
			indexes[indexName] = indexFn(db);
		} catch (error) {
			console.error(`Failed to initialize index "${indexName}":`, error);
		}
	}

	// 3. Get table helpers from doc
	const tables = db.tables;

	// 4. Initialize dependencies and convert array to object keyed by workspace IDs
	const workspaces: Record<string, unknown> = {};
	if (workspace.dependencies) {
		for (const dep of workspace.dependencies) {
			// Each dependency should have its actions available under its ID
			// This would need to be implemented when dependencies are actually used
			workspaces[dep.id] = {}; // Placeholder for now
		}
	}

	// 5. Create IndexesAPI by extracting queries from each index
	const indexesAPI = Object.entries(indexes).reduce(
		(acc, [indexName, index]) => {
			acc[indexName] = index.queries;
			return acc;
		},
		{} as Record<string, any>,
	) as IndexesAPI<TIndexes>;

	// 6. Process actions to extract handlers and make them directly callable
	const actionMap = workspace.actions({
		workspaces,
		tables,
		indexes: indexesAPI,
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
		indexes: indexesAPI,
		ydoc: db.ydoc,
		transact: (fn: () => void, origin?: string) => db.transact(fn, origin),
	} satisfies WorkspaceRuntime<TSchema, TActionMap, TIndexes>;

	return workspaceInstance;
}
