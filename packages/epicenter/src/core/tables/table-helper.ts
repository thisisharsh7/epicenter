import { Compile } from 'typebox/compile';
import type { TLocalizedValidationError } from 'typebox/error';
import * as Y from 'yjs';
import type { PartialRow, Row, TableSchema, TablesSchema } from '../schema';
import { tableSchemaToTypebox } from '../schema';
import {
	YKeyValue,
	type YKeyValueChange,
	type YKeyValueChangeHandler,
} from '../utils/y-keyvalue';

/**
 * A single validation error from TypeBox schema validation.
 *
 * Contains detailed information about why a row field failed validation,
 * including the JSON path to the invalid field, the expected schema,
 * and a human-readable error message.
 *
 * @example
 * ```typescript
 * const result = tables.posts.get({ id: '123' });
 * if (result.status === 'invalid') {
 *   for (const error of result.errors) {
 *     console.log(`${error.path}: ${error.message}`);
 *     // Output: "/title: Expected string"
 *   }
 * }
 * ```
 */
export type ValidationError = TLocalizedValidationError;

export type { YKeyValueChange };

/** Storage format for a single cell in a row. Key is column name, val is cell value. */
type CellEntry = { key: string; val: unknown };

/** Y.Array storing cells for a single row, wrapped by YKeyValue for O(1) lookups. */
type RowArray = Y.Array<CellEntry>;

/** Y.Map storing rows for a single table, keyed by row ID. */
type TableMap = Y.Map<RowArray>;

/** Y.Map storing all tables, keyed by table name. */
type TablesMap = Y.Map<TableMap>;

/** A row that passed validation. */
export type ValidRowResult<TRow> = { status: 'valid'; row: TRow };

/** A row that exists but failed validation. */
export type InvalidRowResult = {
	status: 'invalid';
	id: string;
	tableName: string;
	errors: ValidationError[];
	row: unknown;
};

/** A row that was not found. */
export type NotFoundResult = { status: 'not_found'; id: string };

/**
 * Result of validating a row.
 * The shape after parsing a row from storage - either valid or invalid.
 */
export type RowResult<TRow> = ValidRowResult<TRow> | InvalidRowResult;

/**
 * Result of getting a single row by ID.
 * Includes not_found since the row may not exist.
 */
export type GetResult<TRow> = RowResult<TRow> | NotFoundResult;

/**
 * Result of updating a single row.
 *
 * Reflects Yjs semantics: update is a no-op if the row doesn't exist locally.
 * This is intentional - creating a row with partial fields could overwrite
 * a complete row from another peer via Last-Writer-Wins, causing data loss.
 */
export type UpdateResult =
	| { status: 'applied' }
	| { status: 'not_found_locally' };

/**
 * Result of updating multiple rows.
 *
 * - `all_applied`: Every row existed locally and was updated
 * - `partially_applied`: Some rows were updated, others weren't found locally
 * - `none_applied`: No rows were found locally (nothing was updated)
 */
export type UpdateManyResult =
	| { status: 'all_applied'; applied: string[] }
	| {
			status: 'partially_applied';
			applied: string[];
			notFoundLocally: string[];
	  }
	| { status: 'none_applied'; notFoundLocally: string[] };

/**
 * Result of deleting a single row.
 *
 * Reflects Yjs semantics: deleting a non-existent key is a no-op.
 * No operation is recorded, so the delete won't propagate to other peers.
 * You cannot "pre-delete" something that hasn't synced yet.
 */
export type DeleteResult =
	| { status: 'deleted' }
	| { status: 'not_found_locally' };

/**
 * Result of deleting multiple rows.
 *
 * - `all_deleted`: Every row existed locally and was deleted
 * - `partially_deleted`: Some rows were deleted, others weren't found locally
 * - `none_deleted`: No rows were found locally (nothing was deleted)
 */
export type DeleteManyResult =
	| { status: 'all_deleted'; deleted: string[] }
	| {
			status: 'partially_deleted';
			deleted: string[];
			notFoundLocally: string[];
	  }
	| { status: 'none_deleted'; notFoundLocally: string[] };

/**
 * Change event for a single row during table observation.
 *
 * **Why no `id` field?** The row ID is the key in `Map<string, TableRowChange>`,
 * so including it here would be redundant. Access it via the Map iteration:
 * `for (const [rowId, change] of changes) { ... }`
 *
 * **Why does `delete` have no `result`?** When a row is deleted, the data is
 * already gone from the Y.Doc by the time the observer fires. We only know
 * that a row with that ID was removed.
 */
export type TableRowChange<TRow> =
	| { action: 'add'; result: RowResult<TRow> }
	| { action: 'update'; result: RowResult<TRow> }
	| { action: 'delete' };

/**
 * Creates a type-safe collection of table helpers for all tables in a schema.
 */
export function createTableHelpers<TTablesSchema extends TablesSchema>({
	ydoc,
	schema,
}: {
	ydoc: Y.Doc;
	schema: TTablesSchema;
}) {
	const ytables: TablesMap = ydoc.getMap('tables');

	return Object.fromEntries(
		Object.entries(schema).map(([tableName, tableSchema]) => {
			return [
				tableName,
				createTableHelper({ ydoc, tableName, ytables, schema: tableSchema }),
			];
		}),
	) as {
		[TTableName in keyof TTablesSchema]: TableHelper<TTablesSchema[TTableName]>;
	};
}

/**
 * Creates a single table helper with type-safe CRUD operations.
 *
 * ## Storage Architecture (Cell-Level CRDT Merging)
 *
 * Each table is a Y.Map<rowId, RowArray> where each row stores cells separately.
 * This enables concurrent edits to different columns to merge correctly:
 *
 * ```
 * User A edits title, User B edits views → After sync: both changes preserved
 * ```
 */
function createTableHelper<TTableSchema extends TableSchema>({
	ydoc,
	tableName,
	ytables,
	schema,
}: {
	ydoc: Y.Doc;
	tableName: string;
	ytables: TablesMap;
	schema: TTableSchema;
}) {
	type TRow = Row<TTableSchema>;

	/**
	 * Cache of YKeyValue instances per row ID.
	 *
	 * YKeyValue maintains an internal Map for O(1) lookups by column name.
	 * Creating a new YKeyValue for the same Y.Array means rebuilding this Map
	 * by iterating all cells—an O(n) operation per access.
	 *
	 * This cache ensures we reuse the same YKeyValue instance per row,
	 * amortizing the Map construction cost across multiple accesses.
	 *
	 * IMPORTANT: Must be invalidated when a row is deleted or when the
	 * table Y.Map is replaced (due to sync conflict resolution).
	 */
	const rowKVCache = new Map<string, YKeyValue<unknown>>();

	const typeboxSchema = tableSchemaToTypebox(schema);
	const rowValidator = Compile(typeboxSchema);

	let currentTableRef: TableMap | null = null;

	ytables.observe((event) => {
		event.changes.keys.forEach((change, key) => {
			if (key === tableName && change.action === 'update') {
				rowKVCache.clear();
				currentTableRef = ytables.get(tableName) ?? null;
			}
		});
	});

	/**
	 * Get the Y.Map for this table if it exists, or null if not.
	 *
	 * Used by read operations that should NOT create the table if it doesn't exist.
	 * This is critical for sync: if we create an empty table before sync happens,
	 * it will conflict with the synced table from another peer.
	 */
	const getExistingTableMap = (): TableMap | null => {
		const tableMap = ytables.get(tableName) ?? null;
		if (tableMap !== currentTableRef) {
			rowKVCache.clear();
			currentTableRef = tableMap;
		}
		return tableMap;
	};

	/**
	 * Get or lazily create the Y.Map for this table.
	 *
	 * Tables are stored as nested Y.Maps: `ytables.get(tableName)` returns
	 * the table-level Y.Map that holds all rows (keyed by row ID).
	 *
	 * ONLY use this in write operations (upsert, delete, clear).
	 * Read operations should use getExistingTableMap() to avoid
	 * creating conflicting Y.Maps before sync completes.
	 */
	const getOrCreateTableMap = (): TableMap => {
		let tableMap = ytables.get(tableName);
		if (!tableMap) {
			tableMap = new Y.Map() as TableMap;
			ytables.set(tableName, tableMap);
		}
		return tableMap;
	};

	/**
	 * Get or create a YKeyValue wrapper for a row, creating the row if needed.
	 *
	 * Use this for upsert operations that always need a row to exist.
	 * Creates the Y.Array and caches the YKeyValue if the row doesn't exist.
	 *
	 * This is idempotent—safe to call multiple times for the same row ID.
	 * Subsequent calls return the cached YKeyValue without creating duplicates.
	 *
	 * @example
	 * ```typescript
	 * const rowKV = getOrCreateRowKV('post-123');
	 * rowKV.set('title', 'Hello World'); // Always succeeds
	 * ```
	 */
	const getOrCreateRowKV = (rowId: string): YKeyValue<unknown> => {
		const cached = rowKVCache.get(rowId);
		if (cached) return cached;

		const tableMap = getOrCreateTableMap();
		let rowArray = tableMap.get(rowId);
		if (!rowArray) {
			rowArray = new Y.Array() as RowArray;
			tableMap.set(rowId, rowArray);
		}

		const kv = new YKeyValue(rowArray);
		rowKVCache.set(rowId, kv);
		return kv;
	};

	/**
	 * Get the YKeyValue wrapper for an existing row, or null if not found.
	 *
	 * Use this for read/update operations that need to handle missing rows.
	 * Returns null if the row doesn't exist (unlike getOrCreateRowKV).
	 *
	 * The caller must handle the null case—typically by returning a
	 * `not_found` or `not_found_locally` status.
	 *
	 * @example
	 * ```typescript
	 * const rowKV = getRowKV('post-123');
	 * if (!rowKV) return { status: 'not_found', id: 'post-123' };
	 * ```
	 */
	const getRowKV = (rowId: string): YKeyValue<unknown> | null => {
		const tableMap = getExistingTableMap();
		if (!tableMap) {
			rowKVCache.delete(rowId);
			return null;
		}

		const rowArray = tableMap.get(rowId);
		if (!rowArray) {
			rowKVCache.delete(rowId);
			return null;
		}

		const cached = rowKVCache.get(rowId);
		if (cached) {
			return cached;
		}

		const kv = new YKeyValue(rowArray);
		rowKVCache.set(rowId, kv);
		return kv;
	};

	/**
	 * Ensure a YKeyValue wrapper exists for a row during iteration.
	 *
	 * Used by getAll/getAllValid/getAllInvalid/filter/find when iterating
	 * over table entries. Avoids creating duplicate YKeyValue instances
	 * for rows we've already wrapped.
	 *
	 * Unlike getOrCreateRowKV, this doesn't create the row—it assumes
	 * the rowArray already exists (since we're iterating tableMap entries).
	 */
	const ensureRowKV = (id: string, rowArray: RowArray): YKeyValue<unknown> => {
		const cached = rowKVCache.get(id);
		if (cached) return cached;
		const kv = new YKeyValue(rowArray);
		rowKVCache.set(id, kv);
		return kv;
	};

	/**
	 * Reconstruct a row object from cell-level YKeyValue entries.
	 *
	 * Returns `Record<string, unknown>` because we know it's an object with
	 * string keys, but values are unvalidated. Use `validateRow()` to get
	 * a typed `RowResult<TRow>` with validation status.
	 */
	const reconstructRow = (
		rowKV: YKeyValue<unknown>,
	): Record<string, unknown> => {
		const row: Record<string, unknown> = {};
		for (const [key, entry] of rowKV.map.entries()) {
			row[key] = entry.val;
		}
		return row;
	};

	/**
	 * Validate a reconstructed row against the table schema.
	 *
	 * Centralizes validation logic used by get(), getAll(), getAllInvalid(),
	 * and observeChanges(). Returns a discriminated union so callers can
	 * handle valid and invalid rows uniformly.
	 */
	const validateRow = (
		id: string,
		row: Record<string, unknown>,
	): RowResult<TRow> => {
		if (rowValidator.Check(row)) {
			return { status: 'valid', row: row as TRow };
		}
		return {
			status: 'invalid',
			id,
			tableName,
			errors: rowValidator.Errors(row),
			row,
		};
	};

	return {
		name: tableName,
		schema,

		update(partialRow: PartialRow<TTableSchema>): UpdateResult {
			const rowKV = getRowKV(partialRow.id);
			if (!rowKV) return { status: 'not_found_locally' };

			ydoc.transact(() => {
				for (const [key, value] of Object.entries(partialRow)) {
					rowKV.set(key, value);
				}
			});

			return { status: 'applied' };
		},

		upsert(rowData: TRow): void {
			const rowKV = getOrCreateRowKV(rowData.id);
			ydoc.transact(() => {
				for (const [key, value] of Object.entries(rowData)) {
					rowKV.set(key, value);
				}
			});
		},

		upsertMany(rows: TRow[]): void {
			ydoc.transact(() => {
				for (const rowData of rows) {
					const rowKV = getOrCreateRowKV(rowData.id);
					for (const [key, value] of Object.entries(rowData)) {
						rowKV.set(key, value);
					}
				}
			});
		},

		updateMany(rows: PartialRow<TTableSchema>[]): UpdateManyResult {
			const applied: string[] = [];
			const notFoundLocally: string[] = [];

			ydoc.transact(() => {
				for (const partialRow of rows) {
					const rowKV = getRowKV(partialRow.id);
					if (!rowKV) {
						notFoundLocally.push(partialRow.id);
						continue;
					}
					for (const [key, value] of Object.entries(partialRow)) {
						rowKV.set(key, value);
					}
					applied.push(partialRow.id);
				}
			});

			if (notFoundLocally.length === 0)
				return { status: 'all_applied', applied };
			if (applied.length === 0)
				return { status: 'none_applied', notFoundLocally };
			return { status: 'partially_applied', applied, notFoundLocally };
		},

		get(id: string): GetResult<TRow> {
			const rowKV = getRowKV(id);
			if (!rowKV) return { status: 'not_found', id };
			return validateRow(id, reconstructRow(rowKV));
		},

		getAll(): RowResult<TRow>[] {
			const tableMap = getExistingTableMap();
			if (!tableMap) return [];

			const results: RowResult<TRow>[] = [];
			for (const [id, rowArray] of tableMap.entries()) {
				results.push(
					validateRow(id, reconstructRow(ensureRowKV(id, rowArray))),
				);
			}
			return results;
		},

		getAllValid(): TRow[] {
			const tableMap = getExistingTableMap();
			if (!tableMap) return [];

			const result: TRow[] = [];

			for (const [id, rowArray] of tableMap.entries()) {
				const rowKV = ensureRowKV(id, rowArray);
				const row = reconstructRow(rowKV);
				if (rowValidator.Check(row)) {
					result.push(row as TRow);
				}
			}

			return result;
		},

		getAllInvalid(): InvalidRowResult[] {
			const tableMap = getExistingTableMap();
			if (!tableMap) return [];

			const result: InvalidRowResult[] = [];
			for (const [id, rowArray] of tableMap.entries()) {
				const validated = validateRow(
					id,
					reconstructRow(ensureRowKV(id, rowArray)),
				);
				if (validated.status === 'invalid') {
					result.push(validated);
				}
			}
			return result;
		},

		has(id: string): boolean {
			const tableMap = getExistingTableMap();
			return tableMap?.has(id) ?? false;
		},

		delete(id: string): DeleteResult {
			const tableMap = getExistingTableMap();
			if (!tableMap || !tableMap.has(id))
				return { status: 'not_found_locally' };

			tableMap.delete(id);
			rowKVCache.delete(id);
			return { status: 'deleted' };
		},

		deleteMany(ids: string[]): DeleteManyResult {
			const tableMap = getExistingTableMap();
			if (!tableMap) {
				return { status: 'none_deleted', notFoundLocally: ids };
			}

			const deleted: string[] = [];
			const notFoundLocally: string[] = [];

			ydoc.transact(() => {
				for (const id of ids) {
					if (tableMap.has(id)) {
						tableMap.delete(id);
						rowKVCache.delete(id);
						deleted.push(id);
					} else {
						notFoundLocally.push(id);
					}
				}
			});

			if (notFoundLocally.length === 0)
				return { status: 'all_deleted', deleted };
			if (deleted.length === 0)
				return { status: 'none_deleted', notFoundLocally };
			return { status: 'partially_deleted', deleted, notFoundLocally };
		},

		clear(): void {
			const tableMap = getExistingTableMap();
			if (!tableMap) return;

			ydoc.transact(() => {
				for (const id of tableMap.keys()) {
					tableMap.delete(id);
					rowKVCache.delete(id);
				}
			});
		},

		count(): number {
			const tableMap = getExistingTableMap();
			return tableMap?.size ?? 0;
		},

		filter(predicate: (row: TRow) => boolean): TRow[] {
			const tableMap = getExistingTableMap();
			if (!tableMap) return [];

			const result: TRow[] = [];

			for (const [id, rowArray] of tableMap.entries()) {
				const rowKV = ensureRowKV(id, rowArray);
				const row = reconstructRow(rowKV);
				if (rowValidator.Check(row)) {
					const validRow = row as TRow;
					if (predicate(validRow)) {
						result.push(validRow);
					}
				}
			}

			return result;
		},

		find(predicate: (row: TRow) => boolean): TRow | null {
			const tableMap = getExistingTableMap();
			if (!tableMap) return null;

			for (const [id, rowArray] of tableMap.entries()) {
				const rowKV = ensureRowKV(id, rowArray);
				const row = reconstructRow(rowKV);
				if (rowValidator.Check(row)) {
					const validRow = row as TRow;
					if (predicate(validRow)) {
						return validRow;
					}
				}
			}

			return null;
		},

		/**
		 * Watch for row changes with validation status.
		 *
		 * ## Transaction Batching
		 *
		 * Changes are collected during a Yjs transaction and delivered in a single
		 * callback after the transaction completes. `upsertMany(1000)` fires ONE
		 * callback with 1000 changes, not 1000 separate callbacks.
		 *
		 * ## Deduplication
		 *
		 * If a row changes multiple times in one transaction, only the final state
		 * is reported. The Map key is the row ID, so later changes overwrite earlier
		 * ones (last-write-wins per row per transaction).
		 *
		 * ## Add vs Update Classification
		 *
		 * A row is classified as 'add' on its first cell-level change after appearing
		 * in the table map. Subsequent changes are 'update'. This means 'add' fires
		 * when data arrives, not when the empty row container is created.
		 *
		 * ## Table Replacement (Sync Conflicts)
		 *
		 * During sync, the entire table Y.Map can be replaced due to CRDT conflict
		 * resolution. When this happens, 'delete' events fire for all rows in the old
		 * table, then 'add' events fire for all rows in the new table.
		 *
		 * @returns Unsubscribe function that fully detaches all observers
		 */
		observeChanges(
			callback: (
				changes: Map<string, TableRowChange<TRow>>,
				transaction: Y.Transaction,
			) => void,
		): () => void {
			/**
			 * Maps rowId → unsubscribe function for that row's cell-level observer.
			 * Each row has its own YKeyValue wrapper that emits cell changes.
			 */
			const rowObservers = new Map<string, () => void>();

			/**
			 * Tracks rows that were just added to the table map but haven't emitted
			 * their first cell change yet. The first cell change for a row in this set
			 * becomes an 'add' event; subsequent changes become 'update' events.
			 */
			const pendingAdds = new Set<string>();

			let tableMap = getExistingTableMap();
			let tableUnobserve: (() => void) | null = null;

			/**
			 * Transaction batching state. Changes accumulate here during a transaction
			 * and are delivered once via afterTransaction hook. This is O(1) per change
			 * and ensures bulk operations fire a single callback.
			 */
			let pendingChanges = new Map<string, TableRowChange<TRow>>();
			let pendingTransaction: Y.Transaction | null = null;

			const afterTransactionHandler = () => {
				if (pendingChanges.size > 0 && pendingTransaction) {
					const changesToDeliver = pendingChanges;
					const transactionToDeliver = pendingTransaction;
					pendingChanges = new Map();
					pendingTransaction = null;
					callback(changesToDeliver, transactionToDeliver);
				} else {
					pendingChanges = new Map();
					pendingTransaction = null;
				}
			};

			ydoc.on('afterTransaction', afterTransactionHandler);

			const queueChange = (
				rowId: string,
				change: TableRowChange<TRow>,
				transaction: Y.Transaction,
			) => {
				pendingTransaction = transaction;
				pendingChanges.set(rowId, change);
			};

			const validateRow = (
				rowId: string,
				row: Record<string, unknown>,
			): RowResult<TRow> => {
				if (rowValidator.Check(row)) {
					return { status: 'valid', row: row as TRow };
				}
				return {
					status: 'invalid',
					id: rowId,
					tableName,
					errors: rowValidator.Errors(row),
					row,
				};
			};

			/**
			 * Attach a cell-level observer to a row. Returns unsubscribe function.
			 * On each cell change, reconstructs the full row and validates it.
			 */
			const observeRow = (rowId: string, rowArray: RowArray) => {
				const rowKV = ensureRowKV(rowId, rowArray);

				const handler: YKeyValueChangeHandler<unknown> = (
					_cellChanges,
					transaction,
				) => {
					const currentRow = reconstructRow(rowKV);
					const result = validateRow(rowId, currentRow);

					if (pendingAdds.has(rowId)) {
						pendingAdds.delete(rowId);
						queueChange(rowId, { action: 'add', result }, transaction);
					} else {
						queueChange(rowId, { action: 'update', result }, transaction);
					}
				};

				rowKV.on('change', handler);
				return () => rowKV.off('change', handler);
			};

			/**
			 * Rebind observer for a row whose underlying RowArray was replaced.
			 * This can happen during sync when LWW resolves conflicting row structures.
			 */
			const rebindRowObserver = (
				rowId: string,
				newRowArray: RowArray,
				transaction: Y.Transaction,
			) => {
				rowObservers.get(rowId)?.();
				rowKVCache.delete(rowId);
				rowObservers.set(rowId, observeRow(rowId, newRowArray));

				const rowKV = ensureRowKV(rowId, newRowArray);
				const currentRow = reconstructRow(rowKV);
				const result = validateRow(rowId, currentRow);
				queueChange(rowId, { action: 'update', result }, transaction);
			};

			const tableObserver = (event: Y.YMapEvent<RowArray>) => {
				const currentTableMap = event.target;

				event.changes.keys.forEach((change, rowId) => {
					if (change.action === 'add') {
						const rowArray = currentTableMap.get(rowId);
						if (rowArray) {
							rowObservers.set(rowId, observeRow(rowId, rowArray));

							const rowKV = ensureRowKV(rowId, rowArray);
							if (rowKV.map.size > 0) {
								const currentRow = reconstructRow(rowKV);
								const result = validateRow(rowId, currentRow);
								queueChange(
									rowId,
									{ action: 'add', result },
									event.transaction,
								);
							} else {
								pendingAdds.add(rowId);
							}
						}
					} else if (change.action === 'update') {
						const newRowArray = currentTableMap.get(rowId);
						if (newRowArray) {
							rebindRowObserver(rowId, newRowArray, event.transaction);
						}
					} else if (change.action === 'delete') {
						rowObservers.get(rowId)?.();
						rowObservers.delete(rowId);
						pendingAdds.delete(rowId);
						rowKVCache.delete(rowId);
						queueChange(rowId, { action: 'delete' }, event.transaction);
					}
				});
			};

			const teardownTableObservers = () => {
				tableUnobserve?.();
				tableUnobserve = null;
				for (const unsubscribe of rowObservers.values()) unsubscribe();
				rowObservers.clear();
				pendingAdds.clear();
			};

			/**
			 * Begin observing a table map. If fireAddForExisting is true, queues 'add'
			 * events for all existing rows (used when table is created or replaced
			 * after subscription started).
			 */
			const setupTableObserver = (
				map: TableMap,
				fireAddForExisting: boolean,
				transaction?: Y.Transaction,
			) => {
				for (const [rowId, rowArray] of map.entries()) {
					rowObservers.set(rowId, observeRow(rowId, rowArray));
					if (fireAddForExisting && transaction) {
						const rowKV = ensureRowKV(rowId, rowArray);
						const currentRow = reconstructRow(rowKV);
						const result = validateRow(rowId, currentRow);
						queueChange(rowId, { action: 'add', result }, transaction);
					}
				}

				map.observe(tableObserver);
				tableUnobserve = () => map.unobserve(tableObserver);
			};

			if (tableMap) {
				setupTableObserver(tableMap, false);
			}

			const ytablesObserver = (event: Y.YMapEvent<TableMap>) => {
				event.changes.keys.forEach((change, key) => {
					if (key !== tableName) return;

					if (change.action === 'add') {
						const newTableMap = ytables.get(tableName);
						if (newTableMap && !tableMap) {
							tableMap = newTableMap;
							setupTableObserver(newTableMap, true, event.transaction);
						}
					} else if (change.action === 'update') {
						const newTableMap = ytables.get(tableName);
						if (newTableMap && newTableMap !== tableMap) {
							for (const rowId of rowObservers.keys()) {
								queueChange(rowId, { action: 'delete' }, event.transaction);
							}
							teardownTableObservers();
							rowKVCache.clear();
							tableMap = newTableMap;
							setupTableObserver(newTableMap, true, event.transaction);
						}
					} else if (change.action === 'delete') {
						for (const rowId of rowObservers.keys()) {
							queueChange(rowId, { action: 'delete' }, event.transaction);
						}
						teardownTableObservers();
						rowKVCache.clear();
						tableMap = null;
					}
				});
			};
			ytables.observe(ytablesObserver);

			return () => {
				ydoc.off('afterTransaction', afterTransactionHandler);
				ytables.unobserve(ytablesObserver);
				teardownTableObservers();
			};
		},

		$inferRow: null as unknown as TRow,
	};
}

export type TableHelper<TTableSchema extends TableSchema> = ReturnType<
	typeof createTableHelper<TTableSchema>
>;
