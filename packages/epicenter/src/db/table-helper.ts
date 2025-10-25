import * as Y from 'yjs';
import type {
	CellValue,
	GetRowResult,
	Row,
	RowValidationResult,
	SerializedRow,
	TableSchema,
	WorkspaceSchema,
} from '../core/schema';
import { createRow } from '../core/schema';
import { updateYRowFromSerializedRow } from '../utils/yjs';

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
export type YRow = Y.Map<CellValue>;

/**
 * Represents a partial row update where id is required but all other fields are optional.
 *
 * Takes a TableSchema, converts it to SerializedRow to get the input variant,
 * then makes all fields except 'id' optional.
 *
 * Only the fields you include will be updated - the rest remain unchanged. Each field is
 * updated individually in the underlying YJS Map.
 *
 * @example
 * // Update only the title field, leaving other fields unchanged
 * db.tables.posts.update({ id: '123', title: 'New Title' });
 *
 * @example
 * // Update multiple fields at once
 * db.tables.posts.update({ id: '123', title: 'New Title', published: true });
 */
type PartialSerializedRow<TTableSchema extends TableSchema = TableSchema> = {
	id: string;
} & Partial<Omit<SerializedRow<TTableSchema>, 'id'>>;

/**
 * Type-safe table helper with operations for a specific table schema
 */
export type TableHelper<TTableSchema extends TableSchema> = {
	/**
	 * Insert a new row into the table.
	 *
	 * For Y.js columns (ytext, multi-select), provide plain JavaScript values:
	 * - ytext columns accept strings
	 * - multi-select columns accept arrays
	 *
	 * Internally, strings are synced to Y.Text using updateYTextFromString(),
	 * and arrays are synced to Y.Array using updateYArrayFromArray().
	 *
	 * @example
	 * // Insert with plain values
	 * table.insert({
	 *   id: '123',
	 *   content: 'Hello World',           // string for ytext
	 *   tags: ['typescript', 'react'],    // array for multi-select
	 *   viewCount: 0                      // primitive number
	 * });
	 *
	 * @example
	 * // For collaborative editing, get the Y.js reference
	 * const result = table.get('123');
	 * if (result.status === 'valid') {
	 *   editor.bindYText(result.row.content);  // Bind to editor
	 *   result.row.content.insert(0, 'prefix: '); // Direct mutation syncs
	 * }
	 */
	insert(serializedRow: SerializedRow<TTableSchema>): void;

	/**
	 * Update specific fields of an existing row.
	 *
	 * For Y.js columns (ytext, multi-select), provide plain JavaScript values:
	 * - ytext columns accept strings
	 * - multi-select columns accept arrays
	 *
	 * Internally, the existing Y.Text/Y.Array is synced using updateYTextFromString()
	 * or updateYArrayFromArray() to apply minimal changes while preserving CRDT history.
	 *
	 * Only the fields you include will be updated - others remain unchanged.
	 *
	 * @example
	 * // Update with plain values
	 * table.update({
	 *   id: '123',
	 *   content: 'Updated content',        // string for ytext
	 *   tags: ['new', 'tags']              // array for multi-select
	 * });
	 *
	 * @example
	 * // For granular collaborative edits, get Y.js reference directly
	 * const result = table.get('123');
	 * if (result.status === 'valid') {
	 *   result.row.content.insert(0, 'prefix: '); // Granular text edit
	 *   result.row.tags.push(['new-tag']);        // Granular array change
	 * }
	 */
	update(partialSerializedRow: PartialSerializedRow<TTableSchema>): void;

	/**
	 * Insert or update a row (insert if doesn't exist, update if exists).
	 *
	 * For Y.js columns (ytext, multi-select), provide plain JavaScript values.
	 * Internally syncs using updateYTextFromString() and updateYArrayFromArray().
	 *
	 * @example
	 * table.upsert({
	 *   id: '123',
	 *   content: 'Hello World',
	 *   tags: ['typescript']
	 * });
	 */
	upsert(serializedRow: SerializedRow<TTableSchema>): void;

	insertMany(serializedRows: SerializedRow<TTableSchema>[]): void;
	upsertMany(serializedRows: SerializedRow<TTableSchema>[]): void;
	updateMany(partialSerializedRows: PartialSerializedRow<TTableSchema>[]): void;

	/**
	 * Get a row by ID, returning Y.js objects for collaborative editing.
	 *
	 * Returns Y.Text and Y.Array objects that can be:
	 * - Bound to collaborative editors (CodeMirror, etc.)
	 * - Mutated directly for automatic sync across clients
	 *
	 * @example
	 * const result = table.get('123');
	 * if (result.status === 'valid') {
	 *   const row = result.row;
	 *   row.title // Y.Text - bind to editor
	 *   row.tags // Y.Array<string> - mutate directly
	 * }
	 */
	get(id: string): GetRowResult<Row<TTableSchema>>;

	/**
	 * Get all rows with Y.js objects for collaborative editing.
	 */
	getAll(): RowValidationResult<Row<TTableSchema>>[];

	has(id: string): boolean;
	delete(id: string): void;
	deleteMany(ids: string[]): void;
	clear(): void;
	count(): number;
	filter(
		predicate: (row: Row<TTableSchema>) => boolean,
	): Extract<RowValidationResult<Row<TTableSchema>>, { status: 'valid' }>[];
	find(
		predicate: (row: Row<TTableSchema>) => boolean,
	): Extract<
		GetRowResult<Row<TTableSchema>>,
		{ status: 'valid' } | { status: 'not-found' }
	>;
	observe(callbacks: {
		onAdd?: (row: Row<TTableSchema>) => void | Promise<void>;
		onUpdate?: (row: Row<TTableSchema>) => void | Promise<void>;
		onDelete?: (id: string) => void | Promise<void>;
	}): () => void;
};

/**
 * Creates a type-safe collection of table helpers for all tables in a schema.
 *
 * This function maps over the table schemas and creates a TableHelper for each table,
 * returning an object where each key is a table name and each value is the corresponding
 * typed helper with full CRUD operations.
 *
 * @param ydoc - The YJS document instance
 * @param schema - Schema definitions for all tables
 * @param ytables - The root YJS Map containing all table data
 * @returns Object mapping table names to their typed TableHelper instances
 */
export function createTableHelpers<TWorkspaceSchema extends WorkspaceSchema>({
	ydoc,
	schema,
	ytables,
}: {
	ydoc: Y.Doc;
	schema: TWorkspaceSchema;
	ytables: Y.Map<Y.Map<YRow>>;
}) {
	return Object.fromEntries(
		Object.entries(schema).map(([tableName, tableSchema]) => {
			const ytable = ytables.get(tableName);
			if (!ytable) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}
			return [
				tableName,
				createTableHelper({ ydoc, tableName, ytable, schema: tableSchema }),
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
 * @param ytable - The YJS Map containing the table's row data
 * @param schema - The table schema for validation
 * @returns A TableHelper instance with full CRUD operations
 */
function createTableHelper<TTableSchema extends TableSchema>({
	ydoc,
	tableName,
	ytable,
	schema,
}: {
	ydoc: Y.Doc;
	tableName: string;
	ytable: Y.Map<YRow>;
	schema: TTableSchema;
}): TableHelper<TTableSchema> {
	type TRow = Row<TTableSchema>;

	return {
		insert(serializedRow: SerializedRow<TTableSchema>) {
			ydoc.transact(() => {
				if (ytable.has(serializedRow.id)) {
					throw new Error(
						`Row with id "${serializedRow.id}" already exists in table "${tableName}"`,
					);
				}
				const yrow = new Y.Map<CellValue>();
				updateYRowFromSerializedRow({ yrow, serializedRow, schema });
				ytable.set(serializedRow.id, yrow);
			});
		},

		update(partialSerializedRow: PartialSerializedRow<TTableSchema>) {
			ydoc.transact(() => {
				const yrow = ytable.get(partialSerializedRow.id);
				if (!yrow) {
					throw new Error(
						`Row with id "${partialSerializedRow.id}" not found in table "${tableName}"`,
					);
				}
				updateYRowFromSerializedRow({
					yrow,
					serializedRow: partialSerializedRow,
					schema,
				});
			});
		},

		upsert(serializedRow: SerializedRow<TTableSchema>) {
			ydoc.transact(() => {
				let yrow = ytable.get(serializedRow.id);
				if (!yrow) {
					yrow = new Y.Map<CellValue>();
					ytable.set(serializedRow.id, yrow);
				}
				updateYRowFromSerializedRow({ yrow, serializedRow, schema });
			});
		},

		insertMany(serializedRows: SerializedRow<TTableSchema>[]) {
			ydoc.transact(() => {
				for (const serializedRow of serializedRows) {
					if (ytable.has(serializedRow.id)) {
						throw new Error(
							`Row with id "${serializedRow.id}" already exists in table "${tableName}"`,
						);
					}
					const yrow = new Y.Map<CellValue>();
					updateYRowFromSerializedRow({ yrow, serializedRow, schema });
					ytable.set(serializedRow.id, yrow);
				}
			});
		},

		upsertMany(serializedRows: SerializedRow<TTableSchema>[]) {
			ydoc.transact(() => {
				for (const serializedRow of serializedRows) {
					let yrow = ytable.get(serializedRow.id);
					if (!yrow) {
						yrow = new Y.Map<CellValue>();
						ytable.set(serializedRow.id, yrow);
					}
					updateYRowFromSerializedRow({ yrow, serializedRow, schema });
				}
			});
		},

		updateMany(partialSerializedRows: PartialSerializedRow<TTableSchema>[]) {
			ydoc.transact(() => {
				for (const partialSerializedRow of partialSerializedRows) {
					const yrow = ytable.get(partialSerializedRow.id);
					if (!yrow) {
						throw new Error(
							`Row with id "${partialSerializedRow.id}" not found in table "${tableName}"`,
						);
					}
					updateYRowFromSerializedRow({
						yrow,
						serializedRow: partialSerializedRow,
						schema,
					});
				}
			});
		},

		get(id: string): GetRowResult<TRow> {
			const yrow = ytable.get(id);
			if (!yrow) {
				return { status: 'not-found', row: null };
			}

			return createRow({ yrow, schema });
		},

		getAll() {
			const results: RowValidationResult<TRow>[] = [];
			for (const yrow of ytable.values()) {
				const result = createRow({ yrow, schema });
				results.push(result);
			}

			return results;
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
			const results: Extract<RowValidationResult<TRow>, { status: 'valid' }>[] =
				[];

			for (const yrow of ytable.values()) {
				const result = createRow({ yrow, schema });

				// Only include valid rows - skip schema-mismatch and invalid-structure
				if (result.status === 'valid') {
					if (predicate(result.row)) {
						results.push(result);
					}
				}
			}

			return results;
		},

		find(
			predicate: (row: TRow) => boolean,
		): Extract<
			GetRowResult<TRow>,
			{ status: 'valid' } | { status: 'not-found' }
		> {
			for (const yrow of ytable.values()) {
				const result = createRow({ yrow, schema });

				// Only check predicate on valid rows - skip schema-mismatch and invalid-structure
				if (result.status === 'valid') {
					if (predicate(result.row)) {
						return result;
					}
				}
			}

			// No match found (not an error, just no matching row)
			return { status: 'not-found', row: null };
		},

		observe(callbacks: {
			onAdd?: (row: TRow) => void | Promise<void>;
			onUpdate?: (row: TRow) => void | Promise<void>;
			onDelete?: (id: string) => void | Promise<void>;
		}): () => void {
			const observer = (events: Y.YEvent<any>[]) => {
				for (const event of events) {
					// Check if this is a top-level ytable event (row add/delete)
					// or a nested row event (field updates)
					if (event.target === ytable) {
						// Top-level changes: row additions/deletions
						event.changes.keys.forEach((change, key) => {
							if (change.action === 'add') {
								const yrow = ytable.get(key);
								if (yrow) {
									const result = createRow({ yrow, schema });

									switch (result.status) {
										case 'valid':
											callbacks.onAdd?.(result.row);
											break;
										case 'schema-mismatch':
										case 'invalid-structure':
											console.warn(
												`Skipping invalid row in ${tableName}/${key} (onAdd): ${result.status}`,
											);
											break;
									}
								}
							} else if (change.action === 'delete') {
								callbacks.onDelete?.(key);
							}
						});
					} else if (event.path.length === 1 && event.changes.keys.size > 0) {
						// Nested change: field updates within a row
						// event.path[0] is the row ID
						const rowId = event.path[0] as string;
						const yrow = ytable.get(rowId);
						if (yrow) {
							const result = createRow({ yrow, schema });

							switch (result.status) {
								case 'valid':
									callbacks.onUpdate?.(result.row);
									break;
								case 'schema-mismatch':
								case 'invalid-structure':
									console.warn(
										`Skipping invalid row in ${tableName}/${rowId} (onUpdate): ${result.status}`,
									);
									break;
							}
						}
					}
				}
			};

			ytable.observeDeep(observer);

			return () => {
				ytable.unobserveDeep(observer);
			};
		},
	};
}
