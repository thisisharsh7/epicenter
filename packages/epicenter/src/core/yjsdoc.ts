import * as Y from 'yjs';
import type { FilePersistenceConfig } from '../storage/file-persistence';
import { loadYDoc } from '../storage/file-persistence';
import type { CellValue, Row, TableSchema } from './column-schemas';

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
type YjsRowData = Y.Map<CellValue>;

/**
 * Type-safe table helper with operations for a specific table schema
 */
export type TableHelper<TRow extends Row> = {
	insert(data: TRow): void;
	update(id: string, partial: Partial<TRow>): void;
	upsert(data: TRow): void;
	insertMany(rows: TRow[]): void;
	upsertMany(rows: TRow[]): void;
	updateMany(updates: Array<{ id: string; data: Partial<TRow> }>): void;
	get(id: string): TRow | undefined;
	getMany(ids: string[]): TRow[];
	getAll(): TRow[];
	has(id: string): boolean;
	delete(id: string): void;
	deleteMany(ids: string[]): void;
	clear(): void;
	count(): number;
	filter(predicate: (row: TRow) => boolean): TRow[];
	find(predicate: (row: TRow) => boolean): TRow | undefined;
};

/**
 * Create an Epicenter database wrapper with table helpers from an existing Y.Doc.
 * This is a pure function that doesn't handle persistence - it only wraps
 * the Y.Doc with type-safe table operations.
 *
 * @param ydoc - An existing Y.Doc instance (already loaded/initialized)
 * @param tableSchemas - Table schema definitions
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
export function createEpicenterDb<TSchemas extends Record<string, TableSchema>>(
	ydoc: Y.Doc,
	tableSchemas: TSchemas,
) {
	const ytables = ydoc.getMap<Y.Map<YjsRowData>>('tables');

	// Initialize each table as a Y.Map<id, row> (only if not already present)
	// When loading from disk or syncing from network, tables may already exist
	for (const tableName of Object.keys(tableSchemas)) {
		if (!ytables.has(tableName)) {
			ytables.set(tableName, new Y.Map<YjsRowData>());
		}
	}

	return {
		/**
		 * Table helpers organized by table name
		 * Each table has methods for type-safe CRUD operations
		 */
		tables: Object.fromEntries(
			Object.keys(tableSchemas).map((tableName) => {
				const ytable = ytables.get(tableName);
				if (!ytable) {
					throw new Error(`Table "${tableName}" not found in YJS document`);
				}

				const tableHelper = {
					insert(data: Row) {
						ydoc.transact(() => {
							const id = data.id as string;
							if (ytable.has(id)) {
								throw new Error(
									`Row with id "${id}" already exists in table "${tableName}"`,
								);
							}
							const ymap = new Y.Map<CellValue>();
							for (const [key, value] of Object.entries(data)) {
								ymap.set(key, value);
							}
							ytable.set(id, ymap);
						});
					},

					update(id: string, partial: Partial<Row>) {
						ydoc.transact(() => {
							const ymap = ytable.get(id);
							if (!ymap) {
								throw new Error(
									`Row with id "${id}" not found in table "${tableName}"`,
								);
							}
							for (const [key, value] of Object.entries(partial)) {
								if (value !== undefined) {
									ymap.set(key, value);
								}
							}
						});
					},

					upsert(data: Row) {
						ydoc.transact(() => {
							const id = data.id as string;
							let ymap = ytable.get(id);
							if (!ymap) {
								ymap = new Y.Map<CellValue>();
								ytable.set(id, ymap);
							}
							for (const [key, value] of Object.entries(data)) {
								ymap.set(key, value);
							}
						});
					},

					insertMany(rows: Row[]) {
						ydoc.transact(() => {
							for (const row of rows) {
								const id = row.id as string;
								if (ytable.has(id)) {
									throw new Error(
										`Row with id "${id}" already exists in table "${tableName}"`,
									);
								}
								const ymap = new Y.Map<CellValue>();
								for (const [key, value] of Object.entries(row)) {
									ymap.set(key, value);
								}
								ytable.set(id, ymap);
							}
						});
					},

					upsertMany(rows: Row[]) {
						ydoc.transact(() => {
							for (const row of rows) {
								const id = row.id as string;
								let ymap = ytable.get(id);
								if (!ymap) {
									ymap = new Y.Map<CellValue>();
									ytable.set(id, ymap);
								}
								for (const [key, value] of Object.entries(row)) {
									ymap.set(key, value);
								}
							}
						});
					},

					updateMany(updates: Array<{ id: string; data: Partial<Row> }>) {
						ydoc.transact(() => {
							for (const { id, data } of updates) {
								const ymap = ytable.get(id);
								if (!ymap) {
									throw new Error(
										`Row with id "${id}" not found in table "${tableName}"`,
									);
								}
								for (const [key, value] of Object.entries(data)) {
									if (value !== undefined) {
										ymap.set(key, value);
									}
								}
							}
						});
					},

					get(id: string) {
						const ymap = ytable.get(id);
						if (!ymap) return undefined;
						return Object.fromEntries(ymap.entries()) as Row;
					},

					getMany(ids: string[]) {
						const rows: Row[] = [];
						for (const id of ids) {
							const ymap = ytable.get(id);
							if (ymap) {
								rows.push(Object.fromEntries(ymap.entries()) as Row);
							}
						}
						return rows;
					},

					getAll() {
						const rows: Row[] = [];
						for (const ymap of ytable.values()) {
							rows.push(Object.fromEntries(ymap.entries()) as Row);
						}
						return rows;
					},

					has(id: string) {
						return ytable.has(id);
					},

					delete(id: string) {
						ydoc.transact(() => {
							ytable.delete(id);
						});
					},

					deleteMany(ids: string[]) {
						ydoc.transact(() => {
							for (const id of ids) {
								ytable.delete(id);
							}
						});
					},

					clear() {
						ydoc.transact(() => {
							ytable.clear();
						});
					},

					count() {
						return ytable.size;
					},

					filter(predicate: (row: Row) => boolean) {
						const results: Row[] = [];
						for (const ymap of ytable.values()) {
							const row = Object.fromEntries(ymap.entries()) as Row;
							if (predicate(row)) {
								results.push(row);
							}
						}
						return results;
					},

					find(predicate: (row: Row) => boolean) {
						for (const ymap of ytable.values()) {
							const row = Object.fromEntries(ymap.entries()) as Row;
							if (predicate(row)) {
								return row;
							}
						}
						return undefined;
					},
				} satisfies TableHelper<Row>;

				return [tableName, tableHelper];
			}),
		) as {
			[TTableName in keyof TSchemas]: TableHelper<Row<TSchemas[TTableName]>>;
		},

		/**
		 * The underlying YJS document
		 * Exposed for persistence and sync providers
		 */
		ydoc,

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
			return Object.keys(tableSchemas);
		},

		/**
		 * Observe all table changes at the document level
		 *
		 * Registers a deep observer on the root tables YMap to intercept all
		 * add, update, and delete operations across all tables.
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = doc.observe({
		 *   onAdd: (tableName, data) => {
		 *     console.log(`Row added to ${tableName}:`, data);
		 *   },
		 *   onUpdate: (tableName, data) => {
		 *     console.log(`Row updated in ${tableName}:`, data);
		 *   },
		 *   onDelete: (tableName, id) => {
		 *     console.log(`Row ${id} deleted from ${tableName}`);
		 *   },
		 * });
		 *
		 * // Later: unsubscribe when done
		 * unsubscribe();
		 * ```
		 */
		observe(handlers: {
			onAdd: (tableName: string, data: Row) => void | Promise<void>;
			onUpdate: (tableName: string, data: Row) => void | Promise<void>;
			onDelete: (tableName: string, id: string) => void | Promise<void>;
		}): () => void {
			ytables.observeDeep((events: Y.YEvent<Y.Map<YjsRowData>>[]) => {
				for (const event of events) {
					// event.target is the specific table YMap that changed
					// Find which table this is by comparing references
					let changedTableName: string | undefined;
					for (const tableName of Object.keys(tableSchemas)) {
						if (ytables.get(tableName) === event.target) {
							changedTableName = tableName;
							break;
						}
					}

					if (!changedTableName) continue;

					// Process the changes on this table
					event.changes.keys.forEach((change, rowId) => {
						if (change.action === 'add') {
							const ytable = ytables.get(changedTableName);
							const ymap = ytable?.get(rowId);
							if (ymap) {
								const data = Object.fromEntries(ymap.entries()) as Row;
								handlers.onAdd(changedTableName, data);
							}
						} else if (change.action === 'update') {
							const ytable = ytables.get(changedTableName);
							const ymap = ytable?.get(rowId);
							if (ymap) {
								const data = Object.fromEntries(ymap.entries()) as Row;
								handlers.onUpdate(changedTableName, data);
							}
						} else if (change.action === 'delete') {
							handlers.onDelete(changedTableName, rowId);
						}
					});
				}
			});

			return () => {
				ytables.unobserveDeep((events: Y.YEvent<Y.Map<YjsRowData>>[]) => {
					for (const event of events) {
						// event.target is the specific table YMap that changed
						// Find which table this is by comparing references
						let changedTableName: string | undefined;
						for (const tableName of Object.keys(tableSchemas)) {
							if (ytables.get(tableName) === event.target) {
								changedTableName = tableName;
								break;
							}
						}

						if (!changedTableName) continue;

						// Process the changes on this table
						event.changes.keys.forEach((change, rowId) => {
							if (change.action === 'add') {
								const ytable = ytables.get(changedTableName);
								const ymap = ytable?.get(rowId);
								if (ymap) {
									const data = Object.fromEntries(ymap.entries()) as Row;
									handlers.onAdd(changedTableName, data);
								}
							} else if (change.action === 'update') {
								const ytable = ytables.get(changedTableName);
								const ymap = ytable?.get(rowId);
								if (ymap) {
									const data = Object.fromEntries(ymap.entries()) as Row;
									handlers.onUpdate(changedTableName, data);
								}
							} else if (change.action === 'delete') {
								handlers.onDelete(changedTableName, rowId);
							}
						});
					}
				});
			};
		},
	};
}

/**
 * Create an Epicenter database with file persistence.
 * Loads the database from disk if it exists, otherwise creates a new one.
 * Automatically saves changes to disk.
 *
 * @param workspaceId - The workspace ID (used as Y.Doc GUID and filename)
 * @param tableSchemas - Table schema definitions
 * @param options - Persistence configuration
 * @returns Object with table helpers and document utilities
 *
 * @example
 * ```typescript
 * const db = createEpicenterDbFromDisk('workspace-123', {
 *   posts: {
 *     id: id(),
 *     title: text(),
 *     content: richText({ nullable: true }),
 *     tags: multiSelect({ options: ['tech', 'personal', 'work'] as const }),
 *     viewCount: integer(),
 *     published: boolean(),
 *   },
 *   comments: {
 *     id: id(),
 *     postId: text(),
 *     text: text(),
 *   }
 * }, {
 *   storagePath: './data/workspaces',
 *   autoSave: true
 * });
 *
 * // Database is loaded from disk and ready to use
 * db.tables.posts.insert({
 *   id: '1',
 *   title: 'My First Post',
 *   content: new Y.XmlFragment(),
 *   tags: new Y.Array(),
 *   viewCount: 0,
 *   published: false,
 * });
 * ```
 */
export function createEpicenterDbFromDisk<
	TSchemas extends Record<string, TableSchema>,
>(
	workspaceId: string,
	tableSchemas: TSchemas,
	options?: FilePersistenceConfig,
) {
	// Load from disk (or create new if doesn't exist)
	const ydoc = loadYDoc(workspaceId, options);

	// Wrap with table helpers
	return createEpicenterDb(ydoc, tableSchemas);
}
