import * as Y from 'yjs';
import type {
	DateWithTimezone,
	TableSchema,
} from './column-schemas';
import { Serializer } from './columns';

/**
 * YJS document utilities for vault.
 * Handles initialization, conversion, and observation of YJS documents.
 */

/**
 * A single cell value in its plain JavaScript form
 */
type CellValue =
	| string // id, text, rich-text (as string), select
	| number // integer, real
	| boolean // boolean
	| DateWithTimezone // date with timezone
	| string[] // multi-select (strings)
	| number[] // multi-select (numbers)
	| null; // nullable fields

/**
 * A single cell value in its YJS form
 */
type YjsCellValue =
	| Y.Text // rich-text
	| Y.Array<string> // multi-select (string arrays)
	| Y.Array<number> // potential number arrays
	| string // id, text, select
	| number // integer, real
	| boolean // boolean
	| DateWithTimezone // date with timezone
	| null; // nullable fields

/**
 * A row of data with typed cell values
 */
export type RowData = Record<string, CellValue>;

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
type YjsRowData = Y.Map<YjsCellValue>;

/**
 * Create a YJS document for a workspace with encapsulated state.
 * Returns an object with methods for working with the document.
 *
 * All methods accept and return plain JavaScript objects - YJS conversion
 * is handled automatically internally.
 *
 * Creates the structure:
 *   ydoc
 *     └─ tables (Y.Map<Y.Map<YjsRowData>>)
 *         └─ tableName (Y.Map<Y.Map<YjsValue>>)
 *
 * Each table is directly a Y.Map<Y.Map<YjsValue>> where:
 * - Keys are row IDs (string)
 * - Values are Y.Map<YjsValue> representing each row
 *
 * @example
 * ```typescript
 * const doc = createYjsDocument('workspace-id', { posts: { id: id(), ... } });
 *
 * // Single row operations
 * doc.setRow('posts', { id: '1', title: 'Hello' });
 * const row = doc.getRow('posts', '1');
 * const exists = doc.hasRow('posts', '1');
 * doc.deleteRow('posts', '1');
 *
 * // Batch operations (transactional)
 * doc.setRows('posts', [{ id: '1', ... }, { id: '2', ... }]);
 * const rows = doc.getRows('posts', ['1', '2']);
 * doc.deleteRows('posts', ['1', '2']);
 *
 * // Bulk operations
 * const allRows = doc.getAllRows('posts');
 * const count = doc.countRows('posts');
 * doc.clearTable('posts');
 *
 * // Transactions (safe to nest)
 * doc.transact(() => {
 *   doc.setRow('posts', { ... });
 *   doc.setRow('comments', { ... });
 * }, 'bulk-import');
 *
 * // Observe changes (plain objects in callbacks)
 * doc.observeTable('posts', { onAdd, onUpdate, onDelete });
 * ```
 */
export function createYjsDocument(
	workspaceId: string,
	tableSchemas: Record<string, TableSchema>,
) {
	// Initialize Y.Doc
	const ydoc = new Y.Doc({ guid: workspaceId });
	const tables = ydoc.getMap<Y.Map<YjsRowData>>('tables');

	// Initialize each table as a Y.Map<id, row>
	for (const tableName of Object.keys(tableSchemas)) {
		tables.set(tableName, new Y.Map<YjsRowData>());
	}

	/**
	 * Serializer for converting between plain CellValue and YJS CellValue
	 * Handles conversion of rich-text strings to Y.Text and array unwrapping
	 */
	const CellSerializer = (columnType: string) => {
		return Serializer({
			serialize(value: CellValue): YjsCellValue {
				if (columnType === 'rich-text' && typeof value === 'string') {
					return new Y.Text(value);
				}
				return value as YjsCellValue;
			},

			deserialize(value: YjsCellValue): CellValue {
				if (value instanceof Y.Text) {
					return value.toString();
				}
				if (value instanceof Y.Array) {
					return value.toArray();
				}
				return value
			},
		});
	};

	/**
	 * Factory function to create a row serializer for a specific table
	 * Serializes between plain RowData objects and Y.Map YJS structures
	 */
	const RowSerializer = (tableName: string) => {
		const columnSchemas = tableSchemas[tableName];

		return Serializer({
			serialize(value: RowData): YjsRowData {
				const ymap = new Y.Map();

				for (const [key, val] of Object.entries(value)) {
					const schema = columnSchemas[key];
					const cellSerializer = CellSerializer(schema.type);
					ymap.set(key, cellSerializer.serialize(val));
				}

				return ymap as YjsRowData;
			},

			deserialize(ymap: YjsRowData): RowData {
				const obj: RowData = {};

				for (const [key, value] of ymap.entries()) {
					const schema = columnSchemas[key];
					const cellSerializer = CellSerializer(schema.type);
					obj[key] = cellSerializer.deserialize(value);
				}

				return obj;
			},
		});
	};


	return {
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
		 * - Call setRow() inside a transaction (setRow uses transact internally)
		 * - Call setRows() inside a transaction (setRows uses transact internally)
		 * - Nest transactions for cross-table operations
		 *
		 * @example
		 * ```typescript
		 * // Single operation - automatically transactional
		 * doc.setRow('posts', { id: '1', title: 'Hello' });
		 *
		 * // Batch operation - wrapped in transaction
		 * doc.setRows('posts', [{ id: '1', ... }, { id: '2', ... }]);
		 *
		 * // Cross-table transaction - safe nesting
		 * doc.transact(() => {
		 *   doc.setRows('posts', [...]); // reuses outer transaction
		 *   doc.setRow('users', { ... }); // also reuses outer transaction
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
			return Array.from(tables.keys());
		},

		/**
		 * Set a row in a table (replaces if exists, creates if not)
		 * Accepts a plain object and converts to YJS internally
		 * Wrapped in a transaction automatically
		 */
		setRow(tableName: string, data: RowData): void {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			const ymap = RowSerializer(tableName).serialize(data);

			ydoc.transact(() => {
				table.set(data.id as string, ymap);
			});
		},

		/**
		 * Set multiple rows in a table (batch operation)
		 * All rows are set atomically within a single transaction
		 */
		setRows(tableName: string, rows: RowData[]): void {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			ydoc.transact(() => {
				for (const row of rows) {
					const ymap = RowSerializer(tableName).serialize(row);
					table.set(row.id as string, ymap);
				}
			});
		},

		/**
		 * Delete a single row from a table
		 * Returns true if the row existed and was deleted, false otherwise
		 * Wrapped in a transaction automatically
		 */
		deleteRow(tableName: string, id: string): boolean {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			const exists = table.has(id);
			if (!exists) return false;

			ydoc.transact(() => {
				table.delete(id);
			});

			return true;
		},

		/**
		 * Delete multiple rows from a table
		 * Returns the number of rows that were deleted
		 * Wrapped in a transaction automatically
		 */
		deleteRows(tableName: string, ids: string[]): number {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			let count = 0;

			ydoc.transact(() => {
				for (const id of ids) {
					if (table.has(id)) {
						table.delete(id);
						count++;
					}
				}
			});

			return count;
		},

		/**
		 * Get a single row from a table as a plain object
		 * Returns undefined if the row doesn't exist
		 */
		getRow(tableName: string, id: string): RowData | undefined {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			const rowMap = table.get(id);
			if (!rowMap) return undefined;

			return RowSerializer(tableName).deserialize(rowMap);
		},

		/**
		 * Get multiple rows from a table by their IDs
		 * Returns an array of plain objects (only includes rows that exist)
		 */
		getRows(tableName: string, ids: string[]): RowData[] {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			const rows: RowData[] = [];
			for (const id of ids) {
				const rowMap = table.get(id);
				if (rowMap) {
					rows.push(RowSerializer(tableName).deserialize(rowMap));
				}
			}

			return rows;
		},

		/**
		 * Get all rows from a table as an array of plain objects
		 */
		getAllRows(tableName: string): RowData[] {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			const rows: RowData[] = [];
			for (const [id, rowMap] of table.entries()) {
				rows.push(RowSerializer(tableName).deserialize(rowMap));
			}

			return rows;
		},

		/**
		 * Check if a row exists in a table
		 */
		hasRow(tableName: string, id: string): boolean {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			return table.has(id);
		},

		/**
		 * Get the count of rows in a table
		 */
		countRows(tableName: string): number {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			return table.size;
		},

		/**
		 * Clear all rows from a table
		 * Wrapped in a transaction automatically
		 */
		clearTable(tableName: string): void {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			ydoc.transact(() => {
				table.clear();
			});
		},

		/**
		 * Set up observers for a table to trigger index updates
		 * Callbacks receive plain objects, not YJS types
		 * Uses observeDeep to catch both row-level and field-level changes
		 */
		observeTable(
			tableName: string,
			handlers: {
				onAdd: (id: string, data: RowData) => void | Promise<void>;
				onUpdate: (id: string, data: RowData) => void | Promise<void>;
				onDelete: (id: string) => void | Promise<void>;
			},
		) {
			const table = tables.get(tableName);

			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			// Use observeDeep to catch nested changes (fields inside rows)
			table.observeDeep((events) => {
				for (const event of events) {
					event.changes.keys.forEach((change: any, key: string) => {
						if (change.action === 'add') {
							const rowMap = table.get(key);
							if (rowMap) {
								const data = RowSerializer(tableName).deserialize(rowMap);
								handlers.onAdd(key, data);
							}
						} else if (change.action === 'update') {
							const rowMap = table.get(key);
							if (rowMap) {
								const data = RowSerializer(tableName).deserialize(rowMap);
								handlers.onUpdate(key, data);
							}
						} else if (change.action === 'delete') {
							handlers.onDelete(key);
						}
					});
				}
			});
		},
	};
}
