import { type ArkErrors, type } from 'arktype';
import * as Y from 'yjs';
import type { PartialRow, Row, TableSchema, TablesSchema } from '../schema';
import { tableSchemaToYjsArktype } from '../schema';
import { YKeyValue, type YKeyValueChange } from '../utils/y-keyvalue';

/** A row that passed validation. */
export type ValidRowResult<TRow> = { status: 'valid'; row: TRow };

export type RowChange<TRow> =
	| { action: 'add'; id: string; newRow: TRow }
	| { action: 'update'; id: string; oldRow: TRow; newRow: TRow }
	| { action: 'delete'; id: string; oldRow: TRow };

export type RowChangeEvent<TRow> = {
	changes: ReadonlyArray<RowChange<TRow>>;
	transaction: Y.Transaction;
};

/** A row that exists but failed validation. */
export type InvalidRowResult = {
	status: 'invalid';
	id: string;
	tableName: string;
	errors: ArkErrors;
	summary: string;
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
 * Creates a type-safe collection of table helpers for all tables in a schema.
 *
 * This function maps over the table schemas and creates a TableHelper for each table,
 * returning an object where each key is a table name and each value is the corresponding
 * typed helper with full CRUD operations.
 *
 * @param ydoc - The YJS document instance
 * @param schema - Raw table schemas (column definitions only)
 * @returns Object mapping table names to their typed TableHelper instances
 */
export function createTableHelpers<TTablesSchema extends TablesSchema>({
	ydoc,
	schema,
}: {
	ydoc: Y.Doc;
	schema: TTablesSchema;
}) {
	// Y.Map containing Y.Arrays for each table's YKeyValue storage
	// getMap() creates the map if it doesn't exist (idempotent)
	const ytables = ydoc.getMap<Y.Array<{ key: string; val: Row }>>('tables');

	return Object.fromEntries(
		Object.entries(schema).map(([tableName, tableSchema]) => {
			return [
				tableName,
				createTableHelper({
					ydoc,
					tableName,
					ytables,
					schema: tableSchema,
				}),
			];
		}),
	) as {
		[TTableName in keyof TTablesSchema]: TableHelper<TTablesSchema[TTableName]>;
	};
}

/**
 * Creates a single table helper with type-safe CRUD operations for a specific table.
 *
 * This is a pure function that wraps a YKeyValue (representing a table) with methods
 * for inserting, updating, deleting, and querying rows. All operations are properly
 * typed based on the table's row type.
 *
 * ## Storage Architecture (YKeyValue)
 *
 * Tables use YKeyValue instead of nested Y.Maps for dramatically better storage efficiency.
 * YKeyValue stores rows as `{ key: rowId, val: rowData }` pairs in a Y.Array.
 *
 * Benchmark (100k operations on 10 keys):
 * - YKeyValue: 271 bytes
 * - Y.Map: 524,985 bytes (1935x larger!)
 *
 * This is possible because rows are now JSON-serializable (no nested Y.Text/Y.Array).
 *
 * @param ydoc - The YJS document instance (used for transactions)
 * @param tableName - Name of the table (used in error messages)
 * @param ytableArrays - The root YJS Map containing Y.Arrays for each table
 * @param schema - The table schema (column definitions only)
 * @returns A TableHelper instance with full CRUD operations
 */
function createTableHelper<TTableSchema extends TableSchema>({
	ydoc,
	tableName,
	ytables,
	schema,
}: {
	ydoc: Y.Doc;
	tableName: string;
	ytables: Y.Map<Y.Array<{ key: string; val: Row }>>;
	schema: TTableSchema;
}) {
	type TRow = Row<TTableSchema>;

	let ykv: YKeyValue<Row> | null = null;

	/**
	 * Lazily resolve the YKeyValue for this table on each access.
	 *
	 * The YKeyValue wraps a Y.Array and maintains an internal Map for O(1) lookups.
	 * We cache the YKeyValue instance since it maintains state (the lookup map).
	 */
	const getYKeyValue = (): YKeyValue<Row> => {
		if (ykv) return ykv;

		let yarray = ytables.get(tableName);
		if (!yarray) {
			yarray = new Y.Array<{ key: string; val: Row }>();
			ytables.set(tableName, yarray);
		}
		ykv = new YKeyValue(yarray);
		return ykv;
	};

	const asTypedRow = (data: Row): TRow => data as TRow;

	return {
		/**
		 * The name of this table
		 */
		name: tableName,

		/**
		 * The schema definition for this table (column definitions)
		 */
		schema,

		/**
		 * Update specific fields of an existing row.
		 *
		 * For array columns (tags), provide plain arrays.
		 *
		 * Only the fields you include will be updated; others remain unchanged.
		 *
		 * **If the row doesn't exist locally, this is a no-op.** This is intentional due to
		 * Yjs semantics: if another peer has a full row at that ID, creating a row with
		 * only partial fields could completely replace it via Last-Writer-Wins, destroying
		 * all their data. The no-op behavior is the safe choice that prevents catastrophic
		 * data loss.
		 */
		update(partialRow: PartialRow<TTableSchema>): UpdateResult {
			const existing = getYKeyValue().get(partialRow.id);
			if (!existing) {
				return { status: 'not_found_locally' };
			}

			const merged = { ...existing, ...partialRow };
			getYKeyValue().set(partialRow.id, merged);

			return { status: 'applied' };
		},

		/**
		 * Insert or update a row (insert if doesn't exist, update if exists).
		 *
		 * This is the primary write operation for tables. Use it when you have a complete
		 * row and want to ensure it exists in the table regardless of prior state.
		 *
		 * For array columns (tags), provide plain arrays.
		 *
		 * @param rowData - Complete row data with all required fields
		 *
		 * @example
		 * ```typescript
		 * // Create a new post
		 * tables.posts.upsert({
		 *   id: 'post-123',
		 *   title: 'Hello World',
		 *   content: 'rtxt_abc123',  // richtext ID reference
		 *   tags: ['tech', 'blog'],
		 *   published: false,
		 * });
		 *
		 * // Update an existing post (all fields required)
		 * tables.posts.upsert({
		 *   id: 'post-123',
		 *   title: 'Updated Title',
		 *   content: 'rtxt_abc123',
		 *   tags: ['tech'],
		 *   published: true,
		 * });
		 * ```
		 */
		upsert(rowData: TRow): void {
			getYKeyValue().set(rowData.id, rowData);
		},

		/**
		 * Insert or update multiple rows in a single transaction.
		 *
		 * More efficient than calling `upsert` multiple times as all changes
		 * are batched into a single Y.js transaction.
		 *
		 * @param rows - Array of complete row data to upsert
		 *
		 * @example
		 * ```typescript
		 * tables.posts.upsertMany([
		 *   { id: 'post-1', title: 'First', content: 'rtxt_1', tags: [], published: true },
		 *   { id: 'post-2', title: 'Second', content: 'rtxt_2', tags: [], published: false },
		 * ]);
		 * ```
		 */
		upsertMany(rows: TRow[]): void {
			ydoc.transact(() => {
				for (const rowData of rows) {
					getYKeyValue().set(rowData.id, rowData);
				}
			});
		},

		/**
		 * Update multiple rows.
		 *
		 * Rows that don't exist locally are skipped (no-op). See `update` for the rationale.
		 * Returns a status indicating how many rows were applied vs not found locally.
		 */
		updateMany(rows: PartialRow<TTableSchema>[]): UpdateManyResult {
			const applied: string[] = [];
			const notFoundLocally: string[] = [];

			ydoc.transact(() => {
				for (const partialRow of rows) {
					const existing = getYKeyValue().get(partialRow.id);
					if (!existing) {
						notFoundLocally.push(partialRow.id);
						continue;
					}
					const merged = { ...existing, ...partialRow };
					getYKeyValue().set(partialRow.id, merged);
					applied.push(partialRow.id);
				}
			});

			if (notFoundLocally.length === 0) {
				return { status: 'all_applied', applied };
			}
			if (applied.length === 0) {
				return { status: 'none_applied', notFoundLocally };
			}
			return { status: 'partially_applied', applied, notFoundLocally };
		},

		get(id: string): GetResult<TRow> {
			const data = getYKeyValue().get(id);
			if (!data) return { status: 'not_found', id };

			const row = asTypedRow(data);
			const validator = tableSchemaToYjsArktype(schema);
			const result = validator(row);

			if (result instanceof type.errors) {
				return {
					status: 'invalid',
					id,
					tableName,
					errors: result,
					summary: result.summary,
					row,
				};
			}
			return { status: 'valid', row };
		},

		getAll(): RowResult<TRow>[] {
			const validator = tableSchemaToYjsArktype(schema);

			return Array.from(getYKeyValue().map.entries()).map(
				([id, entry]): RowResult<TRow> => {
					const row = asTypedRow(entry.val);
					const result = validator(row);

					return result instanceof type.errors
						? {
								status: 'invalid',
								id,
								tableName,
								errors: result,
								summary: result.summary,
								row,
							}
						: { status: 'valid', row };
				},
			);
		},

		/**
		 * Get all valid rows.
		 * Rows that fail validation are skipped.
		 * Use `getAllInvalid()` to get validation errors for invalid rows.
		 */
		getAllValid(): TRow[] {
			const validator = tableSchemaToYjsArktype(schema);
			const result: TRow[] = [];

			for (const entry of getYKeyValue().map.values()) {
				if (!(validator(entry.val) instanceof type.errors)) {
					result.push(entry.val as TRow);
				}
			}

			return result;
		},

		getAllInvalid(): InvalidRowResult[] {
			const validator = tableSchemaToYjsArktype(schema);
			const result: InvalidRowResult[] = [];

			for (const [id, entry] of getYKeyValue().map.entries()) {
				const validationResult = validator(entry.val);
				if (validationResult instanceof type.errors) {
					result.push({
						status: 'invalid',
						id,
						tableName,
						errors: validationResult,
						summary: validationResult.summary,
						row: entry.val,
					});
				}
			}

			return result;
		},

		/**
		 * Check if a row exists by ID.
		 *
		 * This is a fast O(1) check that doesn't validate the row's contents.
		 * Use `get()` if you need the row data or want to check validation status.
		 *
		 * @param id - The row ID to check
		 * @returns `true` if a row with this ID exists, `false` otherwise
		 *
		 * @example
		 * ```typescript
		 * if (tables.posts.has('post-123')) {
		 *   console.log('Post exists');
		 * }
		 * ```
		 */
		has(id: string): boolean {
			return getYKeyValue().has(id);
		},

		/**
		 * Delete a row by ID.
		 *
		 * Returns status indicating whether the row was deleted or not found locally.
		 * In Yjs, deleting a non-existent key is a no-op (no operation recorded).
		 */
		delete(id: string): DeleteResult {
			if (!getYKeyValue().has(id)) {
				return { status: 'not_found_locally' };
			}

			getYKeyValue().delete(id);
			return { status: 'deleted' };
		},

		/**
		 * Delete multiple rows by IDs.
		 *
		 * Returns status indicating how many rows were deleted vs not found locally.
		 * In Yjs, deleting non-existent keys is a no-op (no operations recorded).
		 */
		deleteMany(ids: string[]): DeleteManyResult {
			const deleted: string[] = [];
			const notFoundLocally: string[] = [];

			ydoc.transact(() => {
				for (const id of ids) {
					if (getYKeyValue().has(id)) {
						getYKeyValue().delete(id);
						deleted.push(id);
					} else {
						notFoundLocally.push(id);
					}
				}
			});

			if (notFoundLocally.length === 0) {
				return { status: 'all_deleted', deleted };
			}
			if (deleted.length === 0) {
				return { status: 'none_deleted', notFoundLocally };
			}
			return { status: 'partially_deleted', deleted, notFoundLocally };
		},

		/**
		 * Clear all rows from the table.
		 *
		 * This permanently deletes all rows in a single Y.js transaction.
		 * The deletion syncs to other peers via CRDT.
		 *
		 * @example
		 * ```typescript
		 * // Reset table to empty state
		 * tables.posts.clear();
		 * console.log(tables.posts.count()); // 0
		 * ```
		 */
		clear(): void {
			const kv = getYKeyValue();
			ydoc.transact(() => {
				for (const key of Array.from(kv.map.keys())) {
					kv.delete(key);
				}
			});
		},

		/**
		 * Get the total number of rows in the table.
		 *
		 * This counts all rows including invalid ones. For just valid rows,
		 * use `getAllValid().length`.
		 *
		 * @returns The number of rows in the table
		 *
		 * @example
		 * ```typescript
		 * const total = tables.posts.count();
		 * console.log(`${total} posts in database`);
		 * ```
		 */
		count(): number {
			return getYKeyValue().map.size;
		},

		/**
		 * Filter rows by predicate, returning only valid rows that match.
		 * Invalid rows are skipped (not validated against predicate).
		 *
		 * @param predicate Function that returns true for rows to include
		 * @returns Array of valid rows that match the predicate
		 */
		filter(predicate: (row: TRow) => boolean): TRow[] {
			const validator = tableSchemaToYjsArktype(schema);
			const result: TRow[] = [];

			for (const entry of getYKeyValue().map.values()) {
				const row = entry.val as TRow;
				if (!(validator(row) instanceof type.errors) && predicate(row)) {
					result.push(row);
				}
			}

			return result;
		},

		/**
		 * Find the first row that matches the predicate.
		 * Invalid rows are skipped (not validated against predicate).
		 *
		 * @param predicate Function that returns true for the row to find
		 * @returns The first matching valid row, or `null` if no match found
		 */
		find(predicate: (row: TRow) => boolean): TRow | null {
			const validator = tableSchemaToYjsArktype(schema);
			const kv = getYKeyValue();

			for (const entry of kv.map.values()) {
				const row = asTypedRow(entry.val);
				const result = validator(row);

				if (!(result instanceof type.errors) && predicate(row)) {
					return row;
				}
			}

			return null;
		},

		/**
		 * Watch for changes to the table and get notified when rows are added, updated, or deleted.
		 *
		 * This is your reactive hook into the table. Whenever someone (local or remote) adds a row,
		 * modifies any field in a row, or deletes a row, you'll receive a callback with the batched
		 * changes for that transaction.
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = table.observeChanges(({ changes, transaction }) => {
		 *   for (const change of changes) {
		 *     switch (change.action) {
		 *       case 'add':
		 *         console.log('New row:', change.newRow);
		 *         break;
		 *       case 'update':
		 *         console.log('Updated:', change.oldRow, '→', change.newRow);
		 *         break;
		 *       case 'delete':
		 *         console.log('Deleted:', change.id);
		 *         break;
		 *     }
		 *   }
		 * });
		 *
		 * unsubscribe(); // Stop watching
		 * ```
		 *
		 * @param callback Function called with batched changes and Y.Transaction
		 * @returns Unsubscribe function to stop observing changes
		 */
		observeChanges(
			callback: (event: RowChangeEvent<TRow>) => void,
		): () => void {
			const kv = getYKeyValue();

			const handler = (
				changes: Map<string, YKeyValueChange<Row>>,
				transaction: Y.Transaction,
			) => {
				const normalized: RowChange<TRow>[] = [];

				for (const [id, change] of changes) {
					if (change.action === 'add') {
						normalized.push({
							action: 'add',
							id,
							newRow: change.newValue as TRow,
						});
					} else if (change.action === 'update') {
						normalized.push({
							action: 'update',
							id,
							oldRow: change.oldValue as TRow,
							newRow: change.newValue as TRow,
						});
					} else {
						normalized.push({
							action: 'delete',
							id,
							oldRow: change.oldValue as TRow,
						});
					}
				}

				if (normalized.length > 0) {
					callback({ changes: normalized, transaction });
				}
			};

			kv.on('change', handler);
			return () => kv.off('change', handler);
		},

		/**
		 * Type inference helper for Row.
		 *
		 * Alternative: `Parameters<typeof tables.posts.upsert>[0]`
		 *
		 * @example
		 * ```typescript
		 * type Post = typeof tables.posts.$inferRow;
		 * // { id: string; title: string; content: string; tags: string[] }
		 * ```
		 */
		$inferRow: null as unknown as TRow,
	};
}

/**
 * Type-safe table helper with operations for a specific table schema.
 *
 * Write methods (all return void, never fail):
 * - upsert/upsertMany: Create or replace entire row (requires all fields, guaranteed valid)
 * - update/updateMany: Merge fields into existing row (no-op if row doesn't exist locally)
 * - delete/deleteMany/clear: Remove rows (no-op if row doesn't exist)
 *
 * Read methods (get, getAll) return null for not-found rather than errors.
 */
export type TableHelper<TTableSchema extends TableSchema> = ReturnType<
	typeof createTableHelper<TTableSchema>
>;
