import { type ArkErrors, type } from 'arktype';
import { createTaggedError } from 'wellcrafted/error';
import { Ok, type Result } from 'wellcrafted/result';
import * as Y from 'yjs';
import { defineMutation, defineQuery } from '../actions';
import type {
	CellValue,
	Row,
	SerializedRow,
	TableSchema,
	TableValidators,
	WorkspaceSchema,
	WorkspaceValidators,
} from '../schema';
import { serializeCellValue } from '../schema';
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
	| { status: 'partially_applied'; applied: string[]; notFoundLocally: string[] }
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
	| { status: 'partially_deleted'; deleted: string[]; notFoundLocally: string[] }
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
 * @param validators - Table validators (validation methods)
 * @param ytables - The root YJS Map containing all table data
 * @returns Object mapping table names to their typed TableHelper instances
 */
export function createTableHelpers<TWorkspaceSchema extends WorkspaceSchema>({
	ydoc,
	schema,
	validators,
	ytables,
}: {
	ydoc: Y.Doc;
	schema: TWorkspaceSchema;
	validators: WorkspaceValidators<TWorkspaceSchema>;
	ytables: Y.Map<Y.Map<YRow>>;
}) {
	return Object.fromEntries(
		Object.entries(schema).map(([tableName, tableSchema]) => {
			// Lazily resolve the Y.Map for this table on each access.
			//
			// Why not cache the reference? When providers sync data via Y.applyUpdate(),
			// Y.js may create new Y.Map structures. A cached reference would point to
			// stale/empty data while the actual synced data lives in a different Y.Map.
			const getYTable = (): Y.Map<YRow> => {
				let ytable = ytables.get(tableName);
				if (!ytable) {
					ytable = new Y.Map<YRow>();
					ytables.set(tableName, ytable);
				}
				return ytable;
			};

			return [
				tableName,
				createTableHelper({
					ydoc,
					tableName,
					getYTable,
					schema: tableSchema,
					// biome-ignore lint/style/noNonNullAssertion: validators is created by createWorkspaceValidators which maps over the same schema object, so every key in schema has a corresponding key in validators
					validators: validators[tableName]!,
				}),
			];
		}),
	) as {
		[TTableName in keyof TWorkspaceSchema]: TableHelper<
			TWorkspaceSchema[TTableName]
		>;
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
 * @param getYTable - Function that returns the YJS Map containing the table's row data
 * @param schema - The table schema (column definitions only)
 * @param validators - The table validators (validation methods)
 * @returns A TableHelper instance with full CRUD operations
 */
function createTableHelper<TTableSchema extends TableSchema>({
	ydoc,
	tableName,
	getYTable,
	schema,
	validators,
}: {
	ydoc: Y.Doc;
	tableName: string;
	getYTable: () => Y.Map<YRow>;
	schema: TTableSchema;
	validators: TableValidators<TTableSchema>;
}) {
	type TRow = Row<TTableSchema>;

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
		 * The validators for this table (runtime validation methods)
		 */
		validators,

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
		update: defineMutation({
			input: validators.toPartialStandardSchema(),
			description: `Update specific fields of an existing row in the ${tableName} table`,
			handler: (partialSerializedRow): UpdateResult => {
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
		}),

		/**
		 * Insert or update a row (insert if doesn't exist, update if exists).
		 *
		 * For Y.js columns (ytext, tags), provide plain JavaScript values.
		 * Internally syncs using updateYTextFromString() and updateYArrayFromArray().
		 */
		upsert: defineMutation({
			input: validators.toStandardSchema(),
			description: `Insert or update a row in the ${tableName} table`,
			handler: (serializedRow) => {
				ydoc.transact(() => {
					let yrow = getYTable().get(serializedRow.id);
					if (!yrow) {
						yrow = new Y.Map<CellValue>();
						getYTable().set(serializedRow.id, yrow);
					}
					updateYRowFromSerializedRow({ yrow, serializedRow, schema });
				});
			},
		}),

		/** Insert or update multiple rows */
		upsertMany: defineMutation({
			input: validators.toStandardSchemaArray(),
			description: `Insert or update multiple rows in the ${tableName} table`,
			handler: ({ rows }) => {
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
		}),

		/**
		 * Update multiple rows.
		 *
		 * Rows that don't exist locally are skipped (no-op). See `update` for the rationale.
		 * Returns a status indicating how many rows were applied vs not found locally.
		 */
		updateMany: defineMutation({
			input: validators.toPartialStandardSchemaArray(),
			description: `Update multiple rows in the ${tableName} table`,
			handler: ({ rows }): UpdateManyResult => {
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
		}),

		/**
		 * Get a row by ID, returning Y.js objects for collaborative editing.
		 *
		 * @returns A discriminated union with status:
		 * - `{ status: 'valid', row }` if row exists and passes validation
		 * - `{ status: 'invalid', id, error }` if row exists but fails validation
		 * - `{ status: 'not_found', id }` if row doesn't exist
		 */
		get: defineQuery({
			input: type({
				id: 'string',
			}),
			description: `Get a row by ID from the ${tableName} table`,
			handler: (params): GetResult<TRow> => {
				const yrow = getYTable().get(params.id);
				if (!yrow) {
					return { status: 'not_found', id: params.id };
				}

				const row = buildRowFromYRow(yrow, schema);
				const yjsValidator = validators.toYjsArktype();
				const result = yjsValidator(row);

				if (result instanceof type.errors) {
					return {
						status: 'invalid',
						id: params.id,
						error: RowValidationError({
							message: `Row '${params.id}' in table '${tableName}' failed validation`,
							context: {
								tableName,
								id: params.id,
								errors: result,
								summary: result.summary,
							},
						}),
					};
				}

				return { status: 'valid', row };
			},
		}),

		/**
		 * Get all rows with their validation status.
		 * Returns both valid and invalid rows as `RowResult<TRow>[]`.
		 * Use `getAllValid()` for just valid rows, `getAllInvalid()` for just errors.
		 */
		getAll: defineQuery({
			description: `Get all rows from the ${tableName} table with validation status`,
			handler: (): RowResult<TRow>[] => {
				const results: RowResult<TRow>[] = [];
				const yjsValidator = validators.toYjsArktype();

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
		}),

		/**
		 * Get all valid rows with Y.js objects for collaborative editing.
		 * Rows that fail validation are skipped.
		 * Use `getAllInvalid()` to get validation errors for invalid rows.
		 */
		getAllValid: defineQuery({
			description: `Get all valid rows from the ${tableName} table`,
			handler: (): TRow[] => {
				const validRows: TRow[] = [];
				const yjsValidator = validators.toYjsArktype();

				for (const yrow of getYTable().values()) {
					const row = buildRowFromYRow(yrow, schema);
					const result = yjsValidator(row);

					if (!(result instanceof type.errors)) {
						validRows.push(row);
					}
				}

				return validRows;
			},
		}),

		/**
		 * Get validation errors for all invalid rows.
		 * Returns an array of RowValidationError objects for rows that fail validation.
		 * Valid rows are skipped.
		 */
		getAllInvalid: defineQuery({
			description: `Get validation errors for invalid rows in the ${tableName} table`,
			handler: (): RowValidationError[] => {
				const errors: RowValidationError[] = [];
				const yjsValidator = validators.toYjsArktype();

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
		}),

		/** Check if a row exists by ID */
		has: defineQuery({
			input: type({ id: 'string' }),
			description: `Check if a row exists in the ${tableName} table`,
			handler: (params) => getYTable().has(params.id),
		}),

		/**
		 * Delete a row by ID.
		 *
		 * Returns status indicating whether the row was deleted or not found locally.
		 * In Yjs, deleting a non-existent key is a no-op (no operation recorded).
		 */
		delete: defineMutation({
			input: type({ id: 'string' }),
			description: `Delete a row from the ${tableName} table`,
			handler: (params): DeleteResult => {
				const exists = getYTable().has(params.id);
				if (!exists) {
					return { status: 'not_found_locally' };
				}

				ydoc.transact(() => {
					getYTable().delete(params.id);
				});

				return { status: 'deleted' };
			},
		}),

		/**
		 * Delete multiple rows by IDs.
		 *
		 * Returns status indicating how many rows were deleted vs not found locally.
		 * In Yjs, deleting non-existent keys is a no-op (no operations recorded).
		 */
		deleteMany: defineMutation({
			input: type({ ids: 'string[]' }),
			description: `Delete multiple rows from the ${tableName} table`,
			handler: (params): DeleteManyResult => {
				const deleted: string[] = [];
				const notFoundLocally: string[] = [];

				ydoc.transact(() => {
					for (const id of params.ids) {
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
		}),

		/** Clear all rows from the table */
		clear: defineMutation({
			description: `Clear all rows from the ${tableName} table`,
			handler: () => {
				ydoc.transact(() => {
					getYTable().clear();
				});
			},
		}),

		/** Get the total number of rows in the table */
		count: defineQuery({
			description: `Count rows in the ${tableName} table`,
			handler: () => getYTable().size,
		}),

		/**
		 * Filter rows by predicate, returning only valid rows that match.
		 * Invalid rows are skipped (not validated against predicate).
		 *
		 * @param predicate Function that returns true for rows to include
		 * @returns Array of valid rows that match the predicate
		 */
		filter(predicate: (row: TRow) => boolean): TRow[] {
			const results: TRow[] = [];
			const yjsValidator = validators.toYjsArktype();

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
			const yjsValidator = validators.toYjsArktype();

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
		 *   onAdd: (result) => {
		 *     if (result.error) {
		 *       console.error('Invalid row:', result.error);
		 *       return;
		 *     }
		 *     console.log('New row:', result.data);
		 *   },
		 *   onUpdate: (result) => {
		 *     if (result.error) {
		 *       console.error('Invalid row:', result.error);
		 *       return;
		 *     }
		 *     console.log('Row changed:', result.data);
		 *   },
		 *   onDelete: (id) => console.log('Row removed:', id),
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
		 * @param callbacks.onAdd Called when a new row is added (receives Result with row or validation errors)
		 * @param callbacks.onUpdate Called when any field within an existing row changes (receives Result with row or validation errors)
		 * @param callbacks.onDelete Called when a row is removed (receives row ID only)
		 * @returns Unsubscribe function to stop observing changes
		 */
		observe(callbacks: {
			onAdd?: (
				result: Result<TRow, RowValidationError>,
			) => void | Promise<void>;
			onUpdate?: (
				result: Result<TRow, RowValidationError>,
			) => void | Promise<void>;
			onDelete?: (id: string) => void | Promise<void>;
		}): () => void {
			const yjsValidator = validators.toYjsArktype();

			const observer = (events: Y.YEvent<Y.Map<YRow> | YRow>[]) => {
				for (const event of events) {
					// Top-level events: row additions/deletions in the table
					// event.target === getYTable() means the change happened directly on the table Y.Map
					if (event.target === getYTable()) {
						event.changes.keys.forEach((change, key) => {
							if (change.action === 'add') {
								// A new row Y.Map was added to the table
								const yrow = getYTable().get(key);
								if (yrow) {
									const row = buildRowFromYRow(yrow, schema);
									const result = yjsValidator(row);

									if (result instanceof type.errors) {
										callbacks.onAdd?.(
											RowValidationErr({
												message: `Row '${key}' in table '${tableName}' failed validation`,
												context: {
													tableName,
													id: key,
													errors: result,
													summary: result.summary,
												},
											}),
										);
									} else {
										callbacks.onAdd?.(Ok(row));
									}
								}
							} else if (change.action === 'delete') {
								// A row Y.Map was removed from the table
								callbacks.onDelete?.(key);
							}
							// Note: We intentionally don't handle 'update' here because:
							// - 'update' only fires if an entire row Y.Map is replaced with another Y.Map
							// - We never do this in our codebase; we only mutate fields within rows
							// - If we ever needed to support this pattern, we would add:
							//   else if (change.action === 'update') { callbacks.onUpdate?.(...) }
						});
					} else if (event.path.length === 1 && event.changes.keys.size > 0) {
						// Nested events: field modifications within a row
						// event.path[0] is the row ID, event.target is the row's Y.Map
						// Any field change (add/update/delete) is treated as a row update
						const rowId = event.path[0] as string;
						const yrow = getYTable().get(rowId);
						if (yrow) {
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
								);
							} else {
								callbacks.onUpdate?.(Ok(row));
							}
						}
					}
					// Note: We use event.path.length === 1 to detect row-level changes
					// If you have Y.Maps/Y.Arrays nested within row fields, those would have
					// event.path.length > 1. Change to >= 1 if you need to support that.
				}
			};

			getYTable().observeDeep(observer);

			return () => {
				getYTable().unobserveDeep(observer);
			};
		},

		/**
		 * Type inference helper for SerializedRow.
		 *
		 * SerializedRow is the plain JavaScript representation of a row,
		 * used for insert, update, and upsert operations.
		 *
		 * @example
		 * ```typescript
		 * type Post = typeof db.posts.$inferSerializedRow;
		 * const post: typeof db.posts.$inferSerializedRow = {
		 *   id: '1',
		 *   title: 'Hello',
		 *   content: 'World',
		 * };
		 * db.posts.upsert(post);
		 * ```
		 */
		$inferSerializedRow: null as unknown as SerializedRow<TTableSchema>,

		/**
		 * Type inference helper for Row.
		 *
		 * Row is the YJS-backed representation returned from get() and getAll().
		 * It includes the toJSON() method for serialization.
		 *
		 * @example
		 * ```typescript
		 * type Post = typeof db.posts.$inferRow;
		 * const result = db.posts.get({ id: '1' });
		 * if (result.data) {
		 *   const post: Post = result.data; // Row with YJS backing
		 * }
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
function buildRowFromYRow<TSchema extends TableSchema>(
	yrow: YRow,
	schema: TSchema,
): Row<TSchema> {
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
				return result as SerializedRow<TSchema>;
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

	return row as Row<TSchema>;
}
