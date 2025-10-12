import * as Y from 'yjs';
import type { TableHelper } from '../db/core';
import { createEpicenterDb } from '../db/core';
import type { WorkspaceActionMap } from './actions';
import type { Schema, TableSchema, ValidatedRow } from './column-schemas';
import type { Index } from './indexes';
import type { ExtractHandlers, IndexesAPI, WorkspaceConfig } from './workspace';
import { extractHandlers } from './workspace';

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
 * Workspace client instance returned from createWorkspaceClient
 * Contains action handlers and lifecycle management
 */
export type WorkspaceClient<TActionMap extends WorkspaceActionMap> =
	ExtractHandlers<TActionMap> & {
		/**
		 * Cleanup function that destroys this workspace and all its dependencies
		 * - Destroys all indexes
		 * - Destroys the YJS document
		 * - Recursively destroys dependency workspaces
		 */
		destroy: () => Promise<void>;
	};

/**
 * Create a workspace client with YJS-first architecture
 * Handles recursive dependency initialization, version resolution, and lifecycle management
 *
 * @param workspace - Workspace configuration
 * @param config - Runtime configuration options
 * @param _initializedClients - Internal cache mapping workspace GUID (id.version) to initialized clients.
 *                               Prevents duplicate initialization when the same workspace version is referenced multiple times
 *                               within a single workspace tree. For example, if both auth and blog depend on storage,
 *                               storage will only be initialized once and reused.
 * @param _initializationChain - Internal stack tracking current initialization chain for circular dependency detection.
 *                                Contains workspace GUIDs currently being initialized.
 */
export async function createWorkspaceClient<
	const TId extends string,
	const TVersion extends string,
	TSchema extends Schema,
	TActionMap extends WorkspaceActionMap,
	const TIndexes extends Record<string, Index<TSchema>>,
>(
	workspace: WorkspaceConfig<
		TId,
		TVersion,
		TSchema,
		TActionMap,
		TIndexes,
		string
	>,
	config: RuntimeConfig = {},
	_initializedClients: Map<string, WorkspaceClient<any>> = new Map(),
	_initializationChain: Set<string> = new Set(),
): Promise<WorkspaceClient<TActionMap>> {
	// Combine ID and version for Y.Doc GUID
	const ydocGuid = `${workspace.id}.${workspace.version}` as const;

	// 1. Check for circular dependencies
	if (_initializationChain.has(ydocGuid)) {
		const path = Array.from(_initializationChain).join(' -> ');
		throw new Error(`Circular dependency detected: ${path} -> ${ydocGuid}`);
	}

	// 2. Check cache - return existing client if already initialized
	const existingClient = _initializedClients.get(ydocGuid);
	if (existingClient) return existingClient;

	// 3. Add to initialization stack for cycle detection
	_initializationChain.add(ydocGuid);

	// 4. Create YJS document with combined ID.version as GUID
	const ydoc = new Y.Doc({ guid: ydocGuid });

	// 5. Initialize Epicenter database
	const db = createEpicenterDb(ydoc, workspace.schema);

	// 6. Call indexes factory function with db
	const indexesObject = workspace.indexes({ db });

	// 7. Validate no duplicate index IDs (keys of returned object)
	const indexIds = Object.keys(indexesObject);
	if (new Set(indexIds).size !== indexIds.length) {
		throw new Error('Duplicate index IDs detected');
	}

	// 8. Call index init functions with db to set up observers and get results
	const indexes: Record<
		string,
		{ destroy: () => void | Promise<void>; queries: any }
	> = {};

	for (const [indexKey, index] of Object.entries(indexesObject)) {
		try {
			indexes[indexKey] = index.init(db);
		} catch (error) {
			console.error(`Failed to initialize index "${indexKey}":`, error);
		}
	}

	// 9. Set up YDoc synchronization and persistence (if provided)
	workspace.setupYDoc?.(ydoc);

	// 10. Remove from stack (dependency fully initialized)
	_initializationChain.delete(ydocGuid);

	// 11. Create IndexesAPI by extracting queries from each index
	const indexesAPI = Object.fromEntries(
		Object.entries(indexes).map(([indexName, index]) => [
			indexName,
			index.queries,
		]),
	) as IndexesAPI<TSchema, TIndexes>;

	// 12. Process actions to extract handlers and make them directly callable
	const actionMap = workspace.actions({
		db,
		indexes: indexesAPI,
	}) as TActionMap;

	// 13. Create client with destroy method
	const client: WorkspaceClient<TActionMap> = {
		...extractHandlers(actionMap),
		destroy: async () => {
			// Destroy indexes
			for (const index of Object.values(indexes)) {
				await index.destroy?.();
			}

			// Destroy YDoc (disconnects providers, cleans up)
			ydoc.destroy();

			// Remove from cache
			_initializedClients.delete(ydocGuid);
		},
	};

	// 14. Cache the client
	_initializedClients.set(ydocGuid, client);

	return client;
}
