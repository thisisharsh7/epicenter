import * as Y from 'yjs';
import type {
	ColumnSchema,
	DateWithTimezone,
	TableSchema,
} from './column-schemas';
import type { RowData } from './indexes';

/**
 * YJS document utilities for vault.
 * Handles initialization, conversion, and observation of YJS documents.
 */

/**
 * A value stored in a YJS Map before conversion to plain
 * Represents the mix of YJS shared types and primitives
 */
export type YjsValue =
	| Y.Text // rich-text
	| Y.Array<string> // multi-select (string arrays)
	| Y.Array<number> // potential number arrays
	| string // id, text, select
	| number // integer, real
	| boolean // boolean
	| DateWithTimezone // date with timezone
	| null; // nullable fields

/**
 * Type alias for a table: Y.Map<RowYMap> where keys are row IDs and values are row Y.Maps
 * Note: Y.Map only accepts one generic parameter for the value type
 */
type TableMap = Y.Map<Y.Map<YjsValue>>;

/**
 * Create a YJS document for a workspace with encapsulated state.
 * Returns an object with methods for working with the document.
 *
 * Creates the structure:
 *   ydoc
 *     └─ tables (Y.Map<TableMap>)
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
 * // Write operations (plain objects in)
 * doc.upsertRow('posts', { id: '1', title: 'Hello' });
 * doc.deleteRow('posts', '1');
 *
 * // Read operations (plain objects out)
 * const row = doc.getRow('posts', '1');
 * const allRows = doc.getAllRows('posts');
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
	const tables = ydoc.getMap<TableMap>('tables');

	// Initialize each table as a Y.Map<id, row>
	for (const tableName of Object.keys(tableSchemas)) {
		tables.set(tableName, new Y.Map<Y.Map<YjsValue>>());
	}

	/**
	 * Internal: Convert a Y.Map (row) to a plain JavaScript object
	 * Handles special types:
	 * - Y.Text → string
	 * - Y.Array → plain array
	 * - Y.Map → nested plain object (recursive)
	 * - Primitives → as-is
	 */
	const _convertYMapToPlain = (ymap: Y.Map<YjsValue>): RowData => {
		const obj: RowData = {};

		for (const [key, value] of ymap.entries()) {
			if (value instanceof Y.Text) {
				obj[key] = value.toString();
			} else if (value instanceof Y.Array) {
				obj[key] = value.toArray();
			} else if (value instanceof Y.Map) {
				obj[key] = _convertYMapToPlain(value);
			} else {
				obj[key] = value;
			}
		}

		return obj;
	};

	/**
	 * Internal: Convert a plain JavaScript object to a Y.Map (row)
	 * Uses table schemas to determine which fields should be Y.Text
	 */
	const _convertPlainToYMap = (tableName: string, data: RowData): Y.Map<YjsValue> => {
		const columnSchemas = tableSchemas[tableName];
		const ymap = new Y.Map<YjsValue>();

		for (const [key, value] of Object.entries(data)) {
			const schema = columnSchemas[key];

			if (schema.type === 'rich-text' && typeof value === 'string') {
				ymap.set(key, new Y.Text(value));
			} else {
				ymap.set(key, value);
			}
		}

		return ymap;
	};

	return {
		/**
		 * The underlying YJS document
		 * Exposed for persistence and sync providers
		 */
		ydoc,

		/**
		 * Execute a function within a YJS transaction
		 * Transactions bundle changes and ensure atomic updates
		 */
		transact(fn: () => void): void {
			ydoc.transact(fn);
		},

		/**
		 * Get all table names in the document
		 */
		getTableNames(): string[] {
			return Array.from(tables.keys());
		},

		/**
		 * Insert or update a row in a table
		 * Accepts a plain object and converts to YJS internally
		 * Wrapped in a transaction automatically
		 */
		upsertRow(tableName: string, data: RowData): void {
			const table = tables.get(tableName);
			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			const ymap = _convertPlainToYMap(tableName, data);

			ydoc.transact(() => {
				table.set(data.id as string, ymap);
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

			return _convertYMapToPlain(rowMap);
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
				rows.push(_convertYMapToPlain(rowMap));
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
								const data = _convertYMapToPlain(rowMap);
								handlers.onAdd(key, data);
							}
						} else if (change.action === 'update') {
							const rowMap = table.get(key);
							if (rowMap) {
								const data = _convertYMapToPlain(rowMap);
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
