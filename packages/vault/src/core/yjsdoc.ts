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
 * Convert a Y.Map (row) to a plain JavaScript object
 * Handles special types:
 * - Y.Text → string
 * - Y.Array → plain array
 * - Y.Map → nested plain object (recursive)
 * - Primitives → as-is
 *
 * Exported as standalone utility for use by indexes
 */
export function convertYMapToPlain(ymap: Y.Map<YjsValue>): RowData {
	const obj: RowData = {};

	for (const [key, value] of ymap.entries()) {
		if (value instanceof Y.Text) {
			// Rich text → plain string
			obj[key] = value.toString();
		} else if (value instanceof Y.Array) {
			// Y.Array → plain array
			obj[key] = value.toArray();
		} else if (value instanceof Y.Map) {
			// Nested Y.Map → plain object (recursive)
			obj[key] = convertYMapToPlain(value);
		} else {
			// Primitives (string, number, boolean, null, etc.)
			obj[key] = value;
		}
	}

	return obj;
}

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
 * Note: Y.Map only accepts one generic parameter for the value type.
 * The key type is always string.
 *
 * @example
 * ```typescript
 * const doc = createYjsDocument('workspace-id', { posts: { id: id(), ... } });
 * doc.observeTable('posts', { onAdd, onUpdate, onDelete });
 * const ymap = doc.convertPlainToYMap('posts', { id: '1', title: 'Hello' });
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
		 * Get a table's Y.Map
		 * Returns Y.Map<Y.Map<YjsValue>> where:
		 * - Keys are row IDs (string)
		 * - Values are Y.Map<YjsValue> representing each row
		 */
		getTable(tableName: string): TableMap {
			const table = tables.get(tableName);

			if (!table) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			return table;
		},

		/**
		 * Get all table names in the document
		 */
		getTableNames(): string[] {
			return Array.from(tables.keys());
		},

		/**
		 * Convert a Y.Map (row) to a plain JavaScript object
		 * Same as standalone convertYMapToPlain but as a method
		 */
		convertYMapToPlain(ymap: Y.Map<YjsValue>): RowData {
			return convertYMapToPlain(ymap);
		},

		/**
		 * Convert a plain JavaScript object to a Y.Map (row)
		 * Uses table schemas from closure to determine which fields should be Y.Text
		 */
		convertPlainToYMap(tableName: string, data: RowData): Y.Map<YjsValue> {
			const columnSchemas = tableSchemas[tableName];
			const ymap = new Y.Map<YjsValue>();

			for (const [key, value] of Object.entries(data)) {
				const schema = columnSchemas[key];

				if (schema.type === 'rich-text' && typeof value === 'string') {
					// Rich text column → Y.Text for collaborative editing
					ymap.set(key, new Y.Text(value));
				} else {
					// All other types → store as-is (including DateWithTimezone objects)
					ymap.set(key, value);
				}
			}

			return ymap;
		},

		/**
		 * Set up observers for a table to trigger index updates
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
								const data = convertYMapToPlain(rowMap);
								handlers.onAdd(key, data);
							}
						} else if (change.action === 'update') {
							const rowMap = table.get(key);
							if (rowMap) {
								const data = convertYMapToPlain(rowMap);
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
