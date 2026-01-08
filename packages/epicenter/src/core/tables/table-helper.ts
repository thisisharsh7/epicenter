import { Compile } from 'typebox/compile';
import type { TLocalizedValidationError } from 'typebox/error';
import * as Y from 'yjs';
import type { PartialRow, Row, TableSchema, TablesSchema } from '../schema';
import { tableSchemaToTypebox } from '../schema';

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

/** Y.Map storing cell values for a single row, keyed by column name. */
type RowMap = Y.Map<unknown>;

/** Y.Map storing rows for a single table, keyed by row ID. */
type TableMap = Y.Map<RowMap>;

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
 * Each table is a Y.Map<rowId, RowMap> where each row is a Y.Map<columnName, value>.
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

	const typeboxSchema = tableSchemaToTypebox(schema);
	const rowValidator = Compile(typeboxSchema);

	/**
	 * Get the Y.Map for this table if it exists, or null if not.
	 *
	 * Used by read operations that should NOT create the table if it doesn't exist.
	 * This is critical for sync: if we create an empty table before sync happens,
	 * it will conflict with the synced table from another peer.
	 */
	const getExistingTableMap = (): TableMap | null => {
		return ytables.get(tableName) ?? null;
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
	 * Get or create a row Y.Map, creating the row if needed.
	 *
	 * Use this for upsert operations that always need a row to exist.
	 * Creates the row Y.Map if it doesn't exist.
	 *
	 * @example
	 * ```typescript
	 * const rowMap = getOrCreateRow('post-123');
	 * rowMap.set('title', 'Hello World'); // Always succeeds
	 * ```
	 */
	const getOrCreateRow = (rowId: string): RowMap => {
		const tableMap = getOrCreateTableMap();
		let rowMap = tableMap.get(rowId);
		if (!rowMap) {
			rowMap = new Y.Map() as RowMap;
			tableMap.set(rowId, rowMap);
		}
		return rowMap;
	};

	/**
	 * Get the Y.Map for an existing row, or null if not found.
	 *
	 * Use this for read/update operations that need to handle missing rows.
	 * Returns null if the row doesn't exist.
	 *
	 * @example
	 * ```typescript
	 * const rowMap = getRow('post-123');
	 * if (!rowMap) return { status: 'not_found', id: 'post-123' };
	 * ```
	 */
	const getRow = (rowId: string): RowMap | null => {
		const tableMap = getExistingTableMap();
		if (!tableMap) return null;
		return tableMap.get(rowId) ?? null;
	};

	/**
	 * Reconstruct a row object from a Y.Map.
	 *
	 * Returns `Record<string, unknown>` because we know it's an object with
	 * string keys, but values are unvalidated. Use `validateRow()` to get
	 * a typed `RowResult<TRow>` with validation status.
	 */
	const reconstructRow = (rowMap: RowMap): Record<string, unknown> => {
		const row: Record<string, unknown> = {};
		for (const [key, value] of rowMap.entries()) {
			row[key] = value;
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
			const rowMap = getRow(partialRow.id);
			if (!rowMap) return { status: 'not_found_locally' };

			ydoc.transact(() => {
				for (const [key, value] of Object.entries(partialRow)) {
					rowMap.set(key, value);
				}
			});

			return { status: 'applied' };
		},

		upsert(rowData: TRow): void {
			const rowMap = getOrCreateRow(rowData.id);
			ydoc.transact(() => {
				for (const [key, value] of Object.entries(rowData)) {
					rowMap.set(key, value);
				}
			});
		},

		upsertMany(rows: TRow[]): void {
			ydoc.transact(() => {
				for (const rowData of rows) {
					const rowMap = getOrCreateRow(rowData.id);
					for (const [key, value] of Object.entries(rowData)) {
						rowMap.set(key, value);
					}
				}
			});
		},

		updateMany(rows: PartialRow<TTableSchema>[]): UpdateManyResult {
			const applied: string[] = [];
			const notFoundLocally: string[] = [];

			ydoc.transact(() => {
				for (const partialRow of rows) {
					const rowMap = getRow(partialRow.id);
					if (!rowMap) {
						notFoundLocally.push(partialRow.id);
						continue;
					}
					for (const [key, value] of Object.entries(partialRow)) {
						rowMap.set(key, value);
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
			const rowMap = getRow(id);
			if (!rowMap) return { status: 'not_found', id };
			return validateRow(id, reconstructRow(rowMap));
		},

		getAll(): RowResult<TRow>[] {
			const tableMap = getExistingTableMap();
			if (!tableMap) return [];

			const results: RowResult<TRow>[] = [];
			for (const [id, rowMap] of tableMap.entries()) {
				results.push(validateRow(id, reconstructRow(rowMap)));
			}
			return results;
		},

		getAllValid(): TRow[] {
			const tableMap = getExistingTableMap();
			if (!tableMap) return [];

			const result: TRow[] = [];

			for (const [_id, rowMap] of tableMap.entries()) {
				const row = reconstructRow(rowMap);
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
			for (const [id, rowMap] of tableMap.entries()) {
				const validated = validateRow(id, reconstructRow(rowMap));
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

			for (const [_id, rowMap] of tableMap.entries()) {
				const row = reconstructRow(rowMap);
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

			for (const [_id, rowMap] of tableMap.entries()) {
				const row = reconstructRow(rowMap);
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
			 * Each row has its own Y.Map that emits cell changes.
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

			const localValidateRow = (
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
			const observeRow = (rowId: string, rowMap: RowMap) => {
				const handler = (event: Y.YMapEvent<unknown>) => {
					const currentRow = reconstructRow(rowMap);
					const result = localValidateRow(rowId, currentRow);

					if (pendingAdds.has(rowId)) {
						pendingAdds.delete(rowId);
						queueChange(rowId, { action: 'add', result }, event.transaction);
					} else {
						queueChange(rowId, { action: 'update', result }, event.transaction);
					}
				};

				rowMap.observe(handler);
				return () => rowMap.unobserve(handler);
			};

			/**
			 * Rebind observer for a row whose underlying RowMap was replaced.
			 * This can happen during sync when LWW resolves conflicting row structures.
			 */
			const rebindRowObserver = (
				rowId: string,
				newRowMap: RowMap,
				transaction: Y.Transaction,
			) => {
				rowObservers.get(rowId)?.();
				rowObservers.set(rowId, observeRow(rowId, newRowMap));

				const currentRow = reconstructRow(newRowMap);
				const result = localValidateRow(rowId, currentRow);
				queueChange(rowId, { action: 'update', result }, transaction);
			};

			const tableObserver = (event: Y.YMapEvent<RowMap>) => {
				const currentTableMap = event.target;

				event.changes.keys.forEach((change, rowId) => {
					if (change.action === 'add') {
						const rowMap = currentTableMap.get(rowId);
						if (rowMap) {
							rowObservers.set(rowId, observeRow(rowId, rowMap));

							if (rowMap.size > 0) {
								const currentRow = reconstructRow(rowMap);
								const result = localValidateRow(rowId, currentRow);
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
						const newRowMap = currentTableMap.get(rowId);
						if (newRowMap) {
							rebindRowObserver(rowId, newRowMap, event.transaction);
						}
					} else if (change.action === 'delete') {
						rowObservers.get(rowId)?.();
						rowObservers.delete(rowId);
						pendingAdds.delete(rowId);
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
				for (const [rowId, rowMap] of map.entries()) {
					rowObservers.set(rowId, observeRow(rowId, rowMap));
					if (fireAddForExisting && transaction) {
						const currentRow = reconstructRow(rowMap);
						const result = localValidateRow(rowId, currentRow);
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
							tableMap = newTableMap;
							setupTableObserver(newTableMap, true, event.transaction);
						}
					} else if (change.action === 'delete') {
						for (const rowId of rowObservers.keys()) {
							queueChange(rowId, { action: 'delete' }, event.transaction);
						}
						teardownTableObservers();
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
