import * as Y from 'yjs';
import type { CellValue, Row, TableSchema } from '../core/column-schemas';

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
type YRow = Y.Map<CellValue>;

/**
 * Converts a YJS row to a plain Row object
 *
 * This is a one-way conversion. We don't need the reverse (Row to YRow) because:
 * - Row updates are always granular (using yrow.set(key, value) for specific fields)
 * - Full row conversions only happen when reading data (get, getAll, filter, etc.)
 * - YJS handles the conversion from plain values to Y.Map internally during insert/update
 */
function toRow(yrow: YRow): Row {
	return Object.fromEntries(yrow.entries()) as Row;
}

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
	observe(handlers: {
		onAdd: (id: string, data: TRow) => void | Promise<void>;
		onUpdate: (id: string, data: TRow) => void | Promise<void>;
		onDelete: (id: string) => void | Promise<void>;
	}): () => void;
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
	const ytables = ydoc.getMap<Y.Map<YRow>>('tables');

	// Initialize each table as a Y.Map<id, row> (only if not already present)
	// When loading from disk or syncing from network, tables may already exist
	for (const tableName of Object.keys(tableSchemas)) {
		if (!ytables.has(tableName)) {
			ytables.set(tableName, new Y.Map<YRow>());
		}
	}

	return {
		/**
		 * Table helpers organized by table name
		 * Each table has methods for type-safe CRUD operations
		 */
		tables: createTableHelpers({ ydoc, tableSchemas, ytables }),

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
	};
}

/**
 * Creates a type-safe collection of table helpers for all tables in a schema.
 *
 * This function maps over the table schemas and creates a TableHelper for each table,
 * returning an object where each key is a table name and each value is the corresponding
 * typed helper with full CRUD operations.
 *
 * @param ydoc - The YJS document instance
 * @param tableSchemas - Schema definitions for all tables
 * @param ytables - The root YJS Map containing all table data
 * @returns Object mapping table names to their typed TableHelper instances
 */
function createTableHelpers<TSchemas extends Record<string, TableSchema>>(
	{ ydoc, tableSchemas, ytables }: { ydoc: Y.Doc; tableSchemas: TSchemas; ytables: Y.Map<Y.Map<YRow>>; }
) {
	return Object.fromEntries(
		Object.keys(tableSchemas).map((tableName) => {
			const ytable = ytables.get(tableName);
			if (!ytable) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}
			return [tableName, createTableHelper(ydoc, tableName, ytable)];
		}),
	) as {
		[TTableName in keyof TSchemas]: TableHelper<Row<TSchemas[TTableName]>>;
	};
}

/**
 * Creates a single table helper with type-safe CRUD operations for a specific table.
 *
 * This is a pure function that wraps a YJS Map (representing a table) with methods
 * for inserting, updating, deleting, and querying rows. All operations are properly
 * typed based on the table's row type.
 *
 * @param ydoc - The YJS document instance (used for transactions)
 * @param tableName - Name of the table (used in error messages)
 * @param ytable - The YJS Map containing the table's row data
 * @returns A TableHelper instance with full CRUD operations
 */
function createTableHelper<TRow extends Row>(
	ydoc: Y.Doc,
	tableName: string,
	ytable: Y.Map<YRow>,
): TableHelper<TRow> {
	return {
		insert(data: TRow) {
			ydoc.transact(() => {
				const id = data.id as string;
				if (ytable.has(id)) {
					throw new Error(
						`Row with id "${id}" already exists in table "${tableName}"`,
					);
				}
				const yrow = new Y.Map<CellValue>();
				for (const [key, value] of Object.entries(data)) {
					yrow.set(key, value);
				}
				ytable.set(id, yrow);
			});
		},

		update(id: string, partial: Partial<TRow>) {
			ydoc.transact(() => {
				const yrow = ytable.get(id);
				if (!yrow) {
					throw new Error(
						`Row with id "${id}" not found in table "${tableName}"`,
					);
				}
				for (const [key, value] of Object.entries(partial)) {
					if (value !== undefined) {
						yrow.set(key, value);
					}
				}
			});
		},

		upsert(data: TRow) {
			ydoc.transact(() => {
				const id = data.id as string;
				let yrow = ytable.get(id);
				if (!yrow) {
					yrow = new Y.Map<CellValue>();
					ytable.set(id, yrow);
				}
				for (const [key, value] of Object.entries(data)) {
					yrow.set(key, value);
				}
			});
		},

		insertMany(rows: TRow[]) {
			ydoc.transact(() => {
				for (const row of rows) {
					const id = row.id as string;
					if (ytable.has(id)) {
						throw new Error(
							`Row with id "${id}" already exists in table "${tableName}"`,
						);
					}
					const yrow = new Y.Map<CellValue>();
					for (const [key, value] of Object.entries(row)) {
						yrow.set(key, value);
					}
					ytable.set(id, yrow);
				}
			});
		},

		upsertMany(rows: TRow[]) {
			ydoc.transact(() => {
				for (const row of rows) {
					const id = row.id as string;
					let yrow = ytable.get(id);
					if (!yrow) {
						yrow = new Y.Map<CellValue>();
						ytable.set(id, yrow);
					}
					for (const [key, value] of Object.entries(row)) {
						yrow.set(key, value);
					}
				}
			});
		},

		updateMany(updates: Array<{ id: string; data: Partial<TRow> }>) {
			ydoc.transact(() => {
				for (const { id, data } of updates) {
					const yrow = ytable.get(id);
					if (!yrow) {
						throw new Error(
							`Row with id "${id}" not found in table "${tableName}"`,
						);
					}
					for (const [key, value] of Object.entries(data)) {
						if (value !== undefined) {
							yrow.set(key, value);
						}
					}
				}
			});
		},

		get(id: string) {
			const yrow = ytable.get(id);
			if (!yrow) return undefined;
			return toRow(yrow) as TRow;
		},

		getMany(ids: string[]) {
			const rows: TRow[] = [];
			for (const id of ids) {
				const yrow = ytable.get(id);
				if (yrow) {
					rows.push(toRow(yrow) as TRow);
				}
			}
			return rows;
		},

		getAll() {
			const rows: TRow[] = [];
			for (const yrow of ytable.values()) {
				rows.push(toRow(yrow) as TRow);
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

		filter(predicate: (row: TRow) => boolean) {
			const results: TRow[] = [];
			for (const yrow of ytable.values()) {
				const row = toRow(yrow) as TRow;
				if (predicate(row)) {
					results.push(row);
				}
			}
			return results;
		},

		find(predicate: (row: TRow) => boolean) {
			for (const yrow of ytable.values()) {
				const row = toRow(yrow) as TRow;
				if (predicate(row)) {
					return row;
				}
			}
			return undefined;
		},

		observe(handlers: {
			onAdd: (id: string, data: TRow) => void | Promise<void>;
			onUpdate: (id: string, data: TRow) => void | Promise<void>;
			onDelete: (id: string) => void | Promise<void>;
		}) {
			const observer = (events: Y.YEvent<any>[]) => {
				for (const event of events) {
					event.changes.keys.forEach((change: any, key: string) => {
						if (change.action === 'add') {
							const yrow = ytable.get(key);
							if (yrow) {
								const data = toRow(yrow) as TRow;
								handlers.onAdd(key, data);
							}
						} else if (change.action === 'update') {
							const yrow = ytable.get(key);
							if (yrow) {
								const data = toRow(yrow) as TRow;
								handlers.onUpdate(key, data);
							}
						} else if (change.action === 'delete') {
							handlers.onDelete(key);
						}
					});
				}
			};

			ytable.observeDeep(observer);

			return () => {
				ytable.unobserveDeep(observer);
			};
		},
	};
}
