import * as Y from 'yjs';
import type { ValidatedRow, WorkspaceSchema } from '../core/schema';
import {
	type TableHelper,
	type YRow,
	createTableHelpers,
} from './table-helper';

// Re-export TableHelper for public API
export type { TableHelper } from './table-helper';

/**
 * Create an Epicenter database wrapper with table helpers from an existing Y.Doc.
 * This is a pure function that doesn't handle persistence - it only wraps
 * the Y.Doc with type-safe table operations.
 *
 * @param ydoc - An existing Y.Doc instance (already loaded/initialized)
 * @param schema - Table schema definitions
 * @returns Object with table helpers and document utilities
 *
 * @example
 * ```typescript
 * // With a fresh Y.Doc
 * const ydoc = new Y.Doc({ guid: 'workspace-123' });
 * const db = createEpicenterDb(ydoc, {
 *   posts: {
 *     id: id(),
 *     title: text(),
 *     published: boolean(),
 *   }
 * });
 *
 * // Or with a Y.Doc from a network provider
 * const provider = new WebrtcProvider('room-name', ydoc);
 * const db = createEpicenterDb(ydoc, schemas);
 * ```
 */
export function createEpicenterDb<TWorkspaceSchema extends WorkspaceSchema>(
	ydoc: Y.Doc,
	schema: TWorkspaceSchema,
) {
	const ytables = ydoc.getMap<Y.Map<YRow>>('tables');

	// Initialize each table as a Y.Map<id, row> (only if not already present)
	// When loading from disk or syncing from network, tables may already exist
	for (const tableName of Object.keys(schema)) {
		if (!ytables.has(tableName)) {
			ytables.set(tableName, new Y.Map<YRow>());
		}
	}

	return {
		/**
		 * Table helpers organized by table name
		 * Each table has methods for type-safe CRUD operations
		 */
		tables: createTableHelpers({ ydoc, schema, ytables }),

		/**
		 * The underlying YJS document
		 * Exposed for persistence and sync providers
		 */
		ydoc,

		/**
		 * Table schemas for all tables
		 * Maps table name to column schemas
		 */
		schema,

		/**
		 * Execute a function within a YJS transaction
		 *
		 * Transactions bundle changes and ensure atomic updates. All changes within
		 * a transaction are sent as a single update to collaborators.
		 *
		 * **Nested Transactions:**
		 * YJS handles nested transact() calls safely by reusing the outer transaction.
		 *
		 * - First transact() creates a transaction (sets doc._transaction, initialCall = true)
		 * - Nested transact() calls check if doc._transaction exists and reuse it
		 * - Inner transact() calls are essentially no-ops - they just execute their function
		 * - Only the outermost transaction (where initialCall = true) triggers cleanup and events
		 *
		 * This means it's safe to:
		 * - Call table methods inside a transaction (they use transact internally)
		 * - Nest transactions for cross-table operations
		 *
		 * @example
		 * ```typescript
		 * // Single operation - automatically transactional
		 * doc.tables.posts.insert({ id: '1', title: 'Hello', ... });
		 *
		 * // Batch operation - wrapped in transaction
		 * doc.tables.posts.insertMany([{ id: '1', ... }, { id: '2', ... }]);
		 *
		 * // Cross-table transaction - safe nesting
		 * doc.transact(() => {
		 *   doc.tables.posts.upsertMany([...]); // reuses outer transaction
		 *   doc.tables.users.insert({ ... }); // also reuses outer transaction
		 * }, 'bulk-import');
		 * ```
		 */
		transact(fn: () => void, origin?: string): void {
			ydoc.transact(fn, origin);
		},

		/**
		 * Get all table names in the document
		 */
		getTableNames(): string[] {
			return Object.keys(schema);
		},
	};
}

/**
 * Type alias for the return type of createEpicenterDb
 * Useful for typing function parameters that accept a database instance
 *
 * @example
 * ```typescript
 * type MyDb = Db<typeof mySchema>;
 *
 * function doSomething(db: MyDb) {
 *   db.tables.posts.insert(...);
 * }
 * ```
 */
export type Db<TWorkspaceSchema extends WorkspaceSchema> = ReturnType<
	typeof createEpicenterDb<TWorkspaceSchema>
>;
