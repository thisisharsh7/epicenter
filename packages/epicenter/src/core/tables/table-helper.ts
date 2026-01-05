import { type ArkErrors, type } from 'arktype';
import { createTaggedError } from 'wellcrafted/error';
import { Ok, type Result } from 'wellcrafted/result';
import * as Y from 'yjs';
import type {
	CellValue,
	PartialSerializedRow,
	Row,
	SerializedRow,
	TableSchema,
	TablesSchema,
} from '../schema';
import { serializeCellValue, tableSchemaToYjsArktype } from '../schema';
import { updateYRowFromSerializedRow } from '../utils/yjs';

/**
 * Context for row validation errors
 */
type RowValidationContext = {
	tableName: string;
	id: string;
	errors: ArkErrors;
	summary: string;
};

/**
 * Error thrown when a row fails schema validation
 */
export const { RowValidationError, RowValidationErr } =
	createTaggedError('RowValidationError').withContext<RowValidationContext>();

export type RowValidationError = ReturnType<typeof RowValidationError>;

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
export type YRow = Y.Map<CellValue>;

/**
 * Result of getting a single row by ID.
 * Uses a status-based discriminated union for explicit handling of all cases.
 */
export type GetResult<TRow> =
	| { status: 'valid'; row: TRow }
	| { status: 'invalid'; id: string; error: RowValidationError }
	| { status: 'not_found'; id: string };

/**
 * Result of getting a row from iteration (getAll).
 * Does not include 'not_found' since we're iterating existing rows.
 */
export type RowResult<TRow> =
	| { status: 'valid'; row: TRow }
	| { status: 'invalid'; id: string; error: RowValidationError };

/**
 * Result of updating a single row.
 *
 * Reflects Yjs semantics: update is a no-op if the row doesn't exist locally.
 * This is intentional - creating a new Y.Map with partial fields could overwrite
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
 * Reflects Yjs semantics: Y.Map.delete() on a non-existent key is a no-op.
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
 * @param ytables - The root YJS Map containing all table data
 * @returns Object mapping table names to their typed TableHelper instances
 */
export function createTableHelpers<TTablesSchema extends TablesSchema>({
	ydoc,
	schema,
	ytables,
}: {
	ydoc: Y.Doc;
	schema: TTablesSchema;
	ytables: Y.Map<Y.Map<YRow>>;
}) {
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
 * This is a pure function that wraps a YJS Map (representing a table) with methods
 * for inserting, updating, deleting, and querying rows. All operations are properly
 * typed based on the table's row type.
 *
 * @param ydoc - The YJS document instance (used for transactions)
 * @param tableName - Name of the table (used in error messages)
 * @param ytables - The root YJS Map containing all table data
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
	ytables: Y.Map<Y.Map<YRow>>;
	schema: TTableSchema;
}) {
	type TRow = Row<TTableSchema>;

	/**
	 * Lazily resolve the Y.Map for this table on each access.
	 *
	 * Why not cache the reference? When providers sync data via Y.applyUpdate(),
	 * Y.js may create new Y.Map structures. A cached reference would point to
	 * stale/empty data while the actual synced data lives in a different Y.Map.
	 */
	const getYTable = (): Y.Map<YRow> => {
		let ytable = ytables.get(tableName);
		if (!ytable) {
			ytable = new Y.Map<YRow>();
			ytables.set(tableName, ytable);
		}
		return ytable;
	};

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
		 * For Y.js columns (ytext, tags), provide plain JavaScript values:
		 * - ytext columns accept strings
		 * - tags columns accept arrays
		 *
		 * Internally, the existing Y.Text/Y.Array is synced using updateYTextFromString()
		 * or updateYArrayFromArray() to apply minimal changes while preserving CRDT history.
		 *
		 * Only the fields you include will be updated; others remain unchanged.
		 *
		 * **If the row doesn't exist locally, this is a no-op.** This is intentional due to
		 * Y.js semantics: creating a new Y.Map and setting it at a key uses Last-Writer-Wins
		 * at the key level. If another peer has a full row at that ID, our new Y.Map (with
		 * only partial fields) could completely replace it, destroying all their data. The
		 * no-op behavior is the safe choice that prevents catastrophic data loss.
		 */
		update(
			partialSerializedRow: PartialSerializedRow<TTableSchema>,
		): UpdateResult {
			const yrow = getYTable().get(partialSerializedRow.id);
			if (!yrow) {
				// No-op: Creating a new Y.Map here would risk replacing an existing row
				// from another peer via LWW, causing catastrophic data loss.
				return { status: 'not_found_locally' };
			}

			ydoc.transact(() => {
				updateYRowFromSerializedRow({
					yrow,
					serializedRow: partialSerializedRow,
					schema,
				});
			});

			return { status: 'applied' };
		},

		/**
		 * Insert or update a row (insert if doesn't exist, update if exists).
		 *
		 * This is the primary write operation for tables. Use it when you have a complete
		 * row and want to ensure it exists in the table regardless of prior state.
		 *
		 * For Y.js columns (ytext, tags), provide plain JavaScript values:
		 * - ytext columns accept strings (synced via updateYTextFromString)
		 * - tags columns accept arrays (synced via updateYArrayFromArray)
		 *
		 * @param serializedRow - Complete row data with all required fields
		 *
		 * @example
		 * ```typescript
		 * // Create a new post
		 * tables.posts.upsert({
		 *   id: 'post-123',
		 *   title: 'Hello World',
		 *   content: 'Post content here',
		 *   tags: ['tech', 'blog'],
		 *   published: false,
		 * });
		 *
		 * // Update an existing post (all fields required)
		 * tables.posts.upsert({
		 *   id: 'post-123',
		 *   title: 'Updated Title',
		 *   content: 'New content',
		 *   tags: ['tech'],
		 *   published: true,
		 * });
		 * ```
		 */
		upsert(serializedRow: SerializedRow<TTableSchema>): void {
			ydoc.transact(() => {
				let yrow = getYTable().get(serializedRow.id);
				if (!yrow) {
					yrow = new Y.Map<CellValue>();
					getYTable().set(serializedRow.id, yrow);
				}
				updateYRowFromSerializedRow({ yrow, serializedRow, schema });
			});
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
		 *   { id: 'post-1', title: 'First', content: '...', tags: [], published: true },
		 *   { id: 'post-2', title: 'Second', content: '...', tags: [], published: false },
		 * ]);
		 * ```
		 */
		upsertMany(rows: SerializedRow<TTableSchema>[]): void {
			ydoc.transact(() => {
				for (const serializedRow of rows) {
					let yrow = getYTable().get(serializedRow.id);
					if (!yrow) {
						yrow = new Y.Map<CellValue>();
						getYTable().set(serializedRow.id, yrow);
					}
					updateYRowFromSerializedRow({ yrow, serializedRow, schema });
				}
			});
		},

		/**
		 * Update multiple rows.
		 *
		 * Rows that don't exist locally are skipped (no-op). See `update` for the rationale.
		 * Returns a status indicating how many rows were applied vs not found locally.
		 */
		updateMany(rows: PartialSerializedRow<TTableSchema>[]): UpdateManyResult {
			const applied: string[] = [];
			const notFoundLocally: string[] = [];

			ydoc.transact(() => {
				for (const partialSerializedRow of rows) {
					const yrow = getYTable().get(partialSerializedRow.id);
					if (!yrow) {
						notFoundLocally.push(partialSerializedRow.id);
						continue;
					}
					updateYRowFromSerializedRow({
						yrow,
						serializedRow: partialSerializedRow,
						schema,
					});
					applied.push(partialSerializedRow.id);
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

		/**
		 * Get a row by ID, returning Y.js objects for collaborative editing.
		 *
		 * @returns A discriminated union with status:
		 * - `{ status: 'valid', row }` if row exists and passes validation
		 * - `{ status: 'invalid', id, error }` if row exists but fails validation
		 * - `{ status: 'not_found', id }` if row doesn't exist
		 */
		get(id: string): GetResult<TRow> {
			const yrow = getYTable().get(id);
			if (!yrow) {
				return { status: 'not_found', id };
			}

			const row = buildRowFromYRow(yrow, schema);
			const yjsValidator = tableSchemaToYjsArktype(schema);
			const result = yjsValidator(row);

			if (result instanceof type.errors) {
				return {
					status: 'invalid',
					id,
					error: RowValidationError({
						message: `Row '${id}' in table '${tableName}' failed validation`,
						context: {
							tableName,
							id,
							errors: result,
							summary: result.summary,
						},
					}),
				};
			}

			return { status: 'valid', row };
		},

		/**
		 * Get all rows with their validation status.
		 * Returns both valid and invalid rows as `RowResult<TRow>[]`.
		 * Use `getAllValid()` for just valid rows, `getAllInvalid()` for just errors.
		 */
		getAll(): RowResult<TRow>[] {
			const results: RowResult<TRow>[] = [];
			const yjsValidator = tableSchemaToYjsArktype(schema);

			for (const [id, yrow] of getYTable().entries()) {
				const row = buildRowFromYRow(yrow, schema);
				const result = yjsValidator(row);

				if (result instanceof type.errors) {
					results.push({
						status: 'invalid',
						id,
						error: RowValidationError({
							message: `Row '${id}' in table '${tableName}' failed validation`,
							context: {
								tableName,
								id,
								errors: result,
								summary: result.summary,
							},
						}),
					});
				} else {
					results.push({ status: 'valid', row });
				}
			}

			return results;
		},

		/**
		 * Get all valid rows with Y.js objects for collaborative editing.
		 * Rows that fail validation are skipped.
		 * Use `getAllInvalid()` to get validation errors for invalid rows.
		 */
		getAllValid(): TRow[] {
			const validRows: TRow[] = [];
			const yjsValidator = tableSchemaToYjsArktype(schema);

			for (const yrow of getYTable().values()) {
				const row = buildRowFromYRow(yrow, schema);
				const result = yjsValidator(row);

				if (!(result instanceof type.errors)) {
					validRows.push(row);
				}
			}

			return validRows;
		},

		/**
		 * Get validation errors for all invalid rows.
		 * Returns an array of RowValidationError objects for rows that fail validation.
		 * Valid rows are skipped.
		 */
		getAllInvalid(): RowValidationError[] {
			const errors: RowValidationError[] = [];
			const yjsValidator = tableSchemaToYjsArktype(schema);

			for (const [id, yrow] of getYTable().entries()) {
				const row = buildRowFromYRow(yrow, schema);
				const result = yjsValidator(row);

				if (result instanceof type.errors) {
					errors.push(
						RowValidationError({
							message: `Row '${id}' in table '${tableName}' failed validation`,
							context: {
								tableName,
								id,
								errors: result,
								summary: result.summary,
							},
						}),
					);
				}
			}

			return errors;
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
			return getYTable().has(id);
		},

		/**
		 * Delete a row by ID.
		 *
		 * Returns status indicating whether the row was deleted or not found locally.
		 * In Yjs, deleting a non-existent key is a no-op (no operation recorded).
		 */
		delete(id: string): DeleteResult {
			const exists = getYTable().has(id);
			if (!exists) {
				return { status: 'not_found_locally' };
			}

			ydoc.transact(() => {
				getYTable().delete(id);
			});

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
					if (getYTable().has(id)) {
						getYTable().delete(id);
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
			ydoc.transact(() => {
				getYTable().clear();
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
			return getYTable().size;
		},

		/**
		 * Filter rows by predicate, returning only valid rows that match.
		 * Invalid rows are skipped (not validated against predicate).
		 *
		 * @param predicate Function that returns true for rows to include
		 * @returns Array of valid rows that match the predicate
		 */
		filter(predicate: (row: TRow) => boolean): TRow[] {
			const results: TRow[] = [];
			const yjsValidator = tableSchemaToYjsArktype(schema);

			for (const yrow of getYTable().values()) {
				const row = buildRowFromYRow(yrow, schema);
				const result = yjsValidator(row);

				// Only include valid rows - skip schema-mismatch
				if (!(result instanceof type.errors)) {
					if (predicate(row)) {
						results.push(row);
					}
				}
			}

			return results;
		},

		/**
		 * Find the first row that matches the predicate.
		 * Invalid rows are skipped (not validated against predicate).
		 *
		 * @param predicate Function that returns true for the row to find
		 * @returns The first matching valid row, or `null` if no match found
		 */
		find(predicate: (row: TRow) => boolean): TRow | null {
			const yjsValidator = tableSchemaToYjsArktype(schema);

			for (const yrow of getYTable().values()) {
				const row = buildRowFromYRow(yrow, schema);
				const result = yjsValidator(row);

				// Only check predicate on valid rows - skip schema-mismatch
				if (!(result instanceof type.errors)) {
					if (predicate(row)) {
						return row;
					}
				}
			}

			// No match found
			return null;
		},

		/**
		 * Watch for changes to the table and get notified when rows are added, updated, or deleted.
		 *
		 * This is your reactive hook into the table. Whenever someone (local or remote) adds a row,
		 * modifies any field in a row, or deletes a row, you'll receive a callback with the relevant
		 * data. Perfect for keeping UI in sync with database state.
		 *
		 * @example
		 * const unsubscribe = table.observe({
		 *   onAdd: (result, transaction) => {
		 *     if (result.error) {
		 *       console.error('Invalid row:', result.error);
		 *       return;
		 *     }
		 *     console.log('New row:', result.data, 'origin:', transaction.origin);
		 *   },
		 *   onUpdate: (result, transaction) => {
		 *     if (result.error) {
		 *       console.error('Invalid row:', result.error);
		 *       return;
		 *     }
		 *     console.log('Row changed:', result.data, 'origin:', transaction.origin);
		 *   },
		 *   onDelete: (id, transaction) => console.log('Row removed:', id, 'origin:', transaction.origin),
		 * });
		 *
		 * // Later, stop watching
		 * unsubscribe();
		 *
		 * ## How it works under the hood
		 *
		 * Tables are stored as a **Y.Map of Y.Maps** structure:
		 * ```
		 * ytable (Y.Map)
		 * ├── "row-1" → Y.Map { title: "Hello", count: 5 }
		 * ├── "row-2" → Y.Map { title: "World", count: 10 }
		 * └── "row-3" → Y.Map { title: "!", count: 1 }
		 * ```
		 *
		 * We use Y.js's `observeDeep()` to watch this nested structure. This gives us events at
		 * two different levels:
		 *
		 * 1. **Changes to the table itself** (adding/removing entire rows)
		 * 2. **Changes inside a row** (modifying fields within an existing row)
		 *
		 * ## How we map Y.js events to your callbacks
		 *
		 * ### onAdd: When a new row is added
		 *
		 * Triggered when an entire row Y.Map is added to the table:
		 * ```typescript
		 * getYTable().set('new-row-id', new Y.Map([['title', 'Hello']]));
		 * ```
		 *
		 * Internally: We check `event.target === ytable` and `change.action === 'add'`
		 *
		 * ### onDelete: When a row is removed
		 *
		 * Triggered when an entire row Y.Map is removed from the table:
		 * ```typescript
		 * getYTable().delete('old-row-id');
		 * ```
		 *
		 * Internally: We check `event.target === ytable` and `change.action === 'delete'`
		 *
		 * ### onUpdate: When anything changes inside a row
		 *
		 * This is where it gets interesting. onUpdate fires for ALL changes to fields within
		 * an existing row:
		 *
		 * ```typescript
		 * // Modifying an existing field
		 * yrow.set('title', 'New Title');
		 *
		 * // Adding a new field
		 * yrow.set('newField', 'value');
		 *
		 * // Removing a field
		 * yrow.delete('oldField');
		 *
		 * // Editing Y.Text content
		 * yrow.get('description').insert(0, 'Prefix: ');
		 *
		 * // Modifying Y.Array content
		 * yrow.get('tags').push(['new-tag']);
		 * ```
		 *
		 * All of these trigger onUpdate, regardless of whether the field was added, modified,
		 * or deleted. Why? Because semantically, they're all "the row changed." You get the
		 * entire row object in the callback, so you can inspect what specifically changed if
		 * needed.
		 *
		 * Internally: We check `event.path.length === 1` (meaning the change happened one level
		 * deep: inside a row, not at the table level). When this fires, we call onUpdate with
		 * the full row data.
		 *
		 * ## Why we don't handle top-level 'update' events
		 *
		 * You might notice we only handle 'add' and 'delete' at the table level, not 'update'.
		 * That's intentional.
		 *
		 * A top-level 'update' event would only fire if we completely replaced a row's Y.Map
		 * with a new Y.Map:
		 * ```typescript
		 * getYTable().set('existing-row', new Y.Map());  // Replace entire row
		 * ```
		 *
		 * We never do this. Instead, we always modify fields within the existing row Y.Map:
		 * ```typescript
		 * const yrow = getYTable().get('existing-row');
		 * yrow.set('title', 'Updated');  // Modify field in existing row
		 * ```
		 *
		 * This fires nested events (detected by `event.path.length === 1`), which trigger
		 * onUpdate. So all row updates are caught by the nested event handler, making the
		 * top-level 'update' check unnecessary.
		 *
		 * ## Design philosophy: Simplicity over granularity
		 *
		 * We could expose more granular callbacks like "onFieldAdded", "onFieldDeleted",
		 * "onFieldModified", but that would complicate the API. Instead:
		 *
		 * - **Simple mental model**: "The row changed" vs "Field X was added, field Y modified"
		 * - **Full context**: You receive the entire row, so you can inspect changes yourself
		 * - **Cleaner code**: Three callbacks instead of many
		 *
		 * ## Validation and Result types
		 *
		 * The onAdd and onUpdate callbacks receive Result types that may contain validation errors.
		 * This allows you to handle invalid rows according to your needs (log them, track in diagnostics, etc.)
		 * rather than silently skipping them.
		 *
		 * @param callbacks Object with optional callbacks for row lifecycle events
		 * @param callbacks.onAdd Called when a new row is added (receives Result with row or validation errors, and the Y.Transaction)
		 * @param callbacks.onUpdate Called when any field within an existing row changes (receives Result with row or validation errors, and the Y.Transaction)
		 * @param callbacks.onDelete Called when a row is removed (receives row ID and the Y.Transaction)
		 * @returns Unsubscribe function to stop observing changes
		 */
		observe(callbacks: {
			onAdd?: (
				result: Result<TRow, RowValidationError>,
				transaction: Y.Transaction,
			) => void | Promise<void>;
			onUpdate?: (
				result: Result<TRow, RowValidationError>,
				transaction: Y.Transaction,
			) => void | Promise<void>;
			onDelete?: (
				id: string,
				transaction: Y.Transaction,
			) => void | Promise<void>;
		}): () => void {
			// CRITICAL: Ensure the table Y.Map exists before setting up the observer.
			// When observeDeep is called on ytables, Y.js starts observing all nested
			// shared types. But if the table Y.Map doesn't exist yet, changes to it
			// (and rows within it) that occur in the same transaction as its creation
			// may not be properly observed. By calling getYTable() here, we ensure
			// the table Y.Map exists and is being observed before any row operations.
			getYTable();

			const yjsValidator = tableSchemaToYjsArktype(schema);

			// ARCHITECTURE: We observe on `ytables` (the root "tables" map) instead of
			// on individual table Y.Maps. This is CRITICAL for sync reliability.
			//
			// WHY: When Y.js syncs with a remote document, if both client and server
			// created a Y.Map at the same key (e.g., 'tabs'), Y.js uses Last-Writer-Wins
			// to resolve the conflict. The "losing" Y.Map becomes orphaned.
			//
			// If we observed on `getYTable()` directly:
			// 1. Client creates local Y.Map for 'tabs'
			// 2. Observer registered on this local Y.Map
			// 3. Sync brings server's Y.Map, which might "win" via LWW
			// 4. `ytables.get('tabs')` now returns server's Y.Map
			// 5. Observer is still on orphaned client Y.Map - events don't fire!
			//
			// By observing on `ytables`, we receive ALL events from ALL tables,
			// then filter for our specific table name using `event.path[0]`.
			// This ensures we see events regardless of which Y.Map "won" the conflict.
			//
			// TRADE-OFF: Each table's observer receives events for ALL tables and filters
			// by table name. For N tables and M events, this is O(N×M) checks. For small N
			// (typical: 3-10 tables), the overhead is negligible. If you have many tables
			// and performance becomes an issue, consider a centralized dispatch pattern.

			const observer = (
				events: Y.YEvent<Y.Map<Y.Map<YRow>> | Y.Map<YRow> | YRow>[],
				transaction: Y.Transaction,
			) => {
				for (const event of events) {
					// Filter events for THIS table only using event.path
					// path structure:
					// - [] = change on ytables itself (table added/removed)
					// - ['tableName'] = row added/removed from table
					// - ['tableName', 'rowId'] = field changed within row
					// - ['tableName', 'rowId', ...] = deep field change (Y.Text/Y.Array)

					// Skip events not for this table (fast path - most common case)
					if (event.path.length > 0 && event.path[0] !== tableName) {
						continue;
					}

					// Case 1: Event on ytables itself (table Y.Map added/removed)
					// We don't expose this to user callbacks since it's rare and internal
					if (event.target === ytables) {
						continue;
					}

					// Case 2: Row added/removed (path = ['tableName'])
					if (event.path.length === 1) {
						event.changes.keys.forEach((change, rowId) => {
							if (change.action === 'add') {
								const yrow = getYTable().get(rowId);
								if (yrow) {
									const row = buildRowFromYRow(yrow, schema);
									const result = yjsValidator(row);

									if (result instanceof type.errors) {
										callbacks.onAdd?.(
											RowValidationErr({
												message: `Row '${rowId}' in table '${tableName}' failed validation`,
												context: {
													tableName,
													id: rowId,
													errors: result,
													summary: result.summary,
												},
											}),
											transaction,
										);
									} else {
										callbacks.onAdd?.(Ok(row), transaction);
									}
								}
							} else if (change.action === 'delete') {
								callbacks.onDelete?.(rowId, transaction);
							}
						});
						continue;
					}

					// Case 3: Field changed within row (path = ['tableName', 'rowId'] or deeper)
					// This handles both direct field changes (path.length === 2) and
					// deep nested changes in Y.Text/Y.Array (path.length > 2)
					if (event.path.length >= 2) {
						const rowId = event.path[1] as string;
						const yrow = getYTable().get(rowId);

						// Fire onUpdate if:
						// - There are actual key changes (field added/modified/deleted), OR
						// - It's a deep change (Y.Text/Y.Array modification within a field)
						if (
							yrow &&
							(event.changes.keys.size > 0 || event.path.length > 2)
						) {
							const row = buildRowFromYRow(yrow, schema);
							const result = yjsValidator(row);

							if (result instanceof type.errors) {
								callbacks.onUpdate?.(
									RowValidationErr({
										message: `Row '${rowId}' in table '${tableName}' failed validation`,
										context: {
											tableName,
											id: rowId,
											errors: result,
											summary: result.summary,
										},
									}),
									transaction,
								);
							} else {
								callbacks.onUpdate?.(Ok(row), transaction);
							}
						}
					}
				}
			};

			// Observe on ytables (root) to catch all events regardless of Y.Map replacement
			ytables.observeDeep(observer);

			return () => {
				ytables.unobserveDeep(observer);
			};
		},

		/**
		 * Type inference helper for SerializedRow.
		 *
		 * SerializedRow is the plain JavaScript representation of a row,
		 * used for upsert and update operations. Y.js types are represented
		 * as plain values (Y.Text → string, Y.Array → array).
		 *
		 * Alternative: `Parameters<typeof tables.posts.upsert>[0]`
		 *
		 * @example
		 * ```typescript
		 * type Post = typeof tables.posts.$inferSerializedRow;
		 * // { id: string; title: string; content: string; tags: string[] }
		 * ```
		 */
		$inferSerializedRow: null as unknown as SerializedRow<TTableSchema>,

		/**
		 * Type inference helper for Row.
		 *
		 * Row is the Y.js-backed representation returned from get() and getAll().
		 * Y.js types are live collaborative objects (Y.Text, Y.Array).
		 *
		 * Alternative: Extract from GetResult: `Extract<ReturnType<typeof tables.posts.get>, { status: 'valid' }>['row']`
		 *
		 * @example
		 * ```typescript
		 * type Post = typeof tables.posts.$inferRow;
		 * // { id: string; title: string; content: Y.Text; tags: Y.Array<string> }
		 * ```
		 */
		$inferRow: null as unknown as Row<TTableSchema>,
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

/**
 * Creates a Row object from a YRow with getters for each property.
 * Properly inspectable in console.log while maintaining transparent delegation to YRow.
 * Includes toJSON and $yRow as non-enumerable properties.
 *
 * @internal
 */
function buildRowFromYRow<TTableSchema extends TableSchema>(
	yrow: YRow,
	schema: TTableSchema,
): Row<TTableSchema> {
	const descriptors = Object.fromEntries(
		Array.from(yrow.keys()).map((key) => [
			key,
			{
				get: () => yrow.get(key),
				enumerable: true,
				configurable: true,
			},
		]),
	);

	const row: Record<string, unknown> = {};
	Object.defineProperties(row, descriptors);

	// Add special properties as non-enumerable
	Object.defineProperties(row, {
		toJSON: {
			value: () => {
				const result: Record<string, unknown> = {};
				for (const key in schema) {
					const value = yrow.get(key);
					if (value !== undefined) {
						result[key] = serializeCellValue(value);
					}
				}
				return result as SerializedRow<TTableSchema>;
			},
			enumerable: false,
			configurable: true,
		},
		$yRow: {
			value: yrow,
			enumerable: false,
			configurable: true,
		},
	});

	return row as Row<TTableSchema>;
}
