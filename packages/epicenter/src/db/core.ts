import * as Y from 'yjs';
import type {
	CellValue,
	Row,
	WorkspaceSchema,
	TableSchema,
	ValidatedRow,
} from '../core/schema';
import {
	type GetRowResult,
	type RowValidationResult,
	validateRow,
} from '../core/validation';

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
export type YRow = Y.Map<CellValue>;

/**
 * Converts a YJS row to a plain Row object
 *
 * This is a one-way conversion. We don't need the reverse (Row to YRow) because:
 * - Row updates are always granular (using yrow.set(key, value) for specific fields)
 * - Full row conversions only happen when reading data (get, getAll, filter, etc.)
 * - YJS handles the conversion from plain values to Y.Map internally during insert/update
 */
export function toRow(yrow: YRow): Row {
	return Object.fromEntries(yrow.entries()) as Row;
}


/**
 * Represents a partial row update where id is required but all other fields are optional.
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
type PartialRow<TRow extends Row = Row> =
	Pick<TRow, 'id'> & Partial<Omit<TRow, 'id'>>;

/**
 * Type-safe table helper with operations for a specific table schema
 */
export type TableHelper<TRow extends Row> = {
	/**
	 * Insert a new row into the table.
	 *
	 * For Y.js columns (ytext, yxmlfragment, multi-select), you must provide
	 * Y.js type instances (Y.Text, Y.XmlFragment, Y.Array). For plain columns
	 * (text, integer, boolean, etc.), provide primitive values.
	 *
	 * Once inserted, you can retrieve the row and mutate Y.js fields directly.
	 * Changes to Y.js objects are automatically synced without calling `.update()`.
	 *
	 * @example
	 * // Insert with Y.js types
	 * const title = new Y.Text();
	 * title.insert(0, 'Hello World');
	 * const tags = new Y.Array();
	 * tags.push(['typescript', 'react']);
	 *
	 * table.insert({
	 *   id: '123',
	 *   title: title,        // Y.Text
	 *   content: content,    // Y.XmlFragment
	 *   tags: tags,          // Y.Array
	 *   viewCount: 0         // primitive number
	 * });
	 *
	 * @example
	 * // For collaborative editing, get the reference and mutate
	 * const row = table.get('123');
	 * if (row.status === 'valid') {
	 *   editor.bindYText(row.row.title);  // Bind to editor
	 *   row.row.title.insert(0, 'prefix: '); // Direct mutation syncs automatically
	 * }
	 */
	insert(row: TRow): void;

	/**
	 * Update specific fields of an existing row.
	 *
	 * **Important:** This method replaces entire field values. For Y.js columns,
	 * you must provide new Y.js type instances. Only the fields you include will be updated.
	 *
	 * If you need to collaboratively edit Y.js fields (like making granular text edits),
	 * use `.get()` to retrieve the Y.js objects and mutate them directly instead.
	 *
	 * @example
	 * // Replace entire field values
	 * const newTitle = new Y.Text();
	 * newTitle.insert(0, 'New Title');
	 * const newTags = new Y.Array();
	 * newTags.push(['updated']);
	 *
	 * table.update({
	 *   id: '123',
	 *   title: newTitle,  // Replaces entire Y.Text
	 *   tags: newTags     // Replaces entire Y.Array
	 * });
	 *
	 * @example
	 * // For granular edits, mutate Y.js objects directly
	 * const row = table.get('123');
	 * if (row.status === 'valid') {
	 *   row.row.title.insert(0, 'Updated: '); // Granular edit
	 *   row.row.tags.push(['new-tag']);       // Granular array change
	 * }
	 */
	update(partial: PartialRow<TRow>): void;

	/**
	 * Insert or update a row (insert if doesn't exist, update if exists).
	 *
	 * **Important:** For Y.js columns, you must provide Y.js type instances. This method
	 * replaces entire field values. For collaborative editing, use `.get()` and mutate directly.
	 *
	 * @example
	 * const title = new Y.Text();
	 * title.insert(0, 'Hello');
	 * const content = new Y.XmlFragment();
	 *
	 * table.upsert({
	 *   id: '123',
	 *   title: title,
	 *   content: content
	 * });
	 */
	upsert(row: TRow): void;

	insertMany(rows: TRow[]): void;
	upsertMany(rows: TRow[]): void;
	updateMany(partials: PartialRow<TRow>[]): void;

	/**
	 * Get a row by ID, returning Y.js objects for collaborative editing.
	 *
	 * Returns Y.Text, Y.XmlFragment, and Y.Array objects that can be:
	 * - Bound to collaborative editors (TipTap, CodeMirror, etc.)
	 * - Mutated directly for automatic sync across clients
	 *
	 * @example
	 * const result = table.get('123');
	 * if (result.status === 'valid') {
	 *   const row = result.row;
	 *   row.title // Y.Text - bind to editor
	 *   row.content // Y.XmlFragment - bind to TipTap
	 *   row.tags // Y.Array<string> - mutate directly
	 * }
	 */
	get(id: string): GetRowResult<TRow>;

	/**
	 * Get all rows with Y.js objects for collaborative editing.
	 */
	getAll(): { valid: TRow[]; invalid: Row[] };

	has(id: string): boolean;
	delete(id: string): void;
	deleteMany(ids: string[]): void;
	clear(): void;
	count(): number;
	filter(predicate: (row: TRow) => boolean): { valid: TRow[]; invalid: Row[] };
	find(predicate: (row: TRow) => boolean): GetRowResult<TRow>;
	observe(callbacks: {
		onAdd?: (row: TRow) => void | Promise<void>;
		onUpdate?: (row: TRow) => void | Promise<void>;
		onDelete?: (id: string) => void | Promise<void>;
	}): () => void;
};

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
function createTableHelpers<TWorkspaceSchema extends WorkspaceSchema>({
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
			ValidatedRow<TWorkspaceSchema[TTableName]>
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
}): TableHelper<ValidatedRow<TTableSchema>> {
	type TRow = ValidatedRow<TTableSchema>;

	/**
	 * Validates a row and returns validation result typed as TRow
	 * The generic validateRow() returns RowValidationResult<ValidatedRow<TableSchema>>,
	 * but we need the specific TRow type for this table. This wrapper narrows the type from
	 * the generic schema to the concrete row type, enabling proper type inference throughout
	 * the table helper.
	 */
	const validateTypedRow = (data: unknown): RowValidationResult<TRow> => {
		const result = validateRow(data, schema);
		if (result.status === 'valid') {
			return { status: 'valid', row: result.row as TRow };
		}
		return result;
	};

	return {
		insert(row: TRow) {
			ydoc.transact(() => {
				if (ytable.has(row.id)) {
					throw new Error(
						`Row with id "${row.id}" already exists in table "${tableName}"`,
					);
				}
				const yrow = new Y.Map<CellValue>();
				for (const [key, value] of Object.entries(row)) {
					yrow.set(key, value);
				}
				ytable.set(row.id, yrow);
			});
		},

		update(partial: PartialRow<TRow>) {
			ydoc.transact(() => {
				const yrow = ytable.get(partial.id);
				if (!yrow) {
					throw new Error(
						`Row with id "${partial.id}" not found in table "${tableName}"`,
					);
				}
				for (const [key, value] of Object.entries(partial)) {
					if (value !== undefined) {
						yrow.set(key, value);
					}
				}
			});
		},

		upsert(row: TRow) {
			ydoc.transact(() => {
				let yrow = ytable.get(row.id);
				if (!yrow) {
					yrow = new Y.Map<CellValue>();
					ytable.set(row.id, yrow);
				}
				for (const [key, value] of Object.entries(row)) {
					yrow.set(key, value);
				}
			});
		},

		insertMany(rows: TRow[]) {
			ydoc.transact(() => {
				for (const row of rows) {
					if (ytable.has(row.id)) {
						throw new Error(
							`Row with id "${row.id}" already exists in table "${tableName}"`,
						);
					}
					const yrow = new Y.Map<CellValue>();
					for (const [key, value] of Object.entries(row)) {
						yrow.set(key, value);
					}
					ytable.set(row.id, yrow);
				}
			});
		},

		upsertMany(rows: TRow[]) {
			ydoc.transact(() => {
				for (const row of rows) {
					let yrow = ytable.get(row.id);
					if (!yrow) {
						yrow = new Y.Map<CellValue>();
						ytable.set(row.id, yrow);
					}
					for (const [key, value] of Object.entries(row)) {
						yrow.set(key, value);
					}
				}
			});
		},

		updateMany(partials: PartialRow<TRow>[]) {
			ydoc.transact(() => {
				for (const partial of partials) {
					const yrow = ytable.get(partial.id);
					if (!yrow) {
						throw new Error(
							`Row with id "${partial.id}" not found in table "${tableName}"`,
						);
					}
					for (const [key, value] of Object.entries(partial)) {
						if (value !== undefined) {
							yrow.set(key, value);
						}
					}
				}
			});
		},

		get(id: string): GetRowResult<TRow> {
			const yrow = ytable.get(id);
			if (!yrow) {
				return { status: 'not-found', row: null };
			}

			const row = toRow(yrow);
			return validateTypedRow(row);
		},

		getAll() {
			const valid: TRow[] = [];
			const invalid: Row[] = [];

			for (const yrow of ytable.values()) {
				const row = toRow(yrow);
				const result = validateTypedRow(row);

				switch (result.status) {
					case 'valid':
						valid.push(result.row);
						break;
					case 'schema-mismatch':
						invalid.push(result.row);
						break;
					case 'invalid-structure':
						console.warn(`Row in table ${tableName} has invalid structure`);
						break;
				}
			}

			return { valid, invalid };
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
			const valid: TRow[] = [];
			const invalid: Row[] = [];

			for (const yrow of ytable.values()) {
				const row = toRow(yrow);

				// Check predicate first (even on unvalidated rows)
				if (predicate(row as TRow)) {
					const result = validateTypedRow(row);

					switch (result.status) {
						case 'valid':
							valid.push(result.row);
							break;
						case 'schema-mismatch':
							invalid.push(result.row);
							break;
						case 'invalid-structure':
							console.warn(
								`Filtered row in table ${tableName} has invalid structure`,
							);
							break;
					}
				}
			}

			return { valid, invalid };
		},

		find(predicate: (row: TRow) => boolean): GetRowResult<TRow> {
			for (const yrow of ytable.values()) {
				const row = toRow(yrow);

				// Check predicate first (even on unvalidated rows)
				if (predicate(row as TRow)) {
					return validateTypedRow(row);
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
					// or a nested yrow event (field updates)
					if (event.target === ytable) {
						// Top-level changes: row additions/deletions
						event.changes.keys.forEach((change, key) => {
							if (change.action === 'add') {
								const yrow = ytable.get(key);
								if (yrow) {
									const row = toRow(yrow);
									const result = validateTypedRow(row);

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
							const row = toRow(yrow);
							const result = validateTypedRow(row);

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
