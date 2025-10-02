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
 *     └─ tables (Y.Map)
 *         └─ tableName (Y.Map)
 *             ├─ rowsById (Y.Map<id, Y.Map<field, value>>)
 *             └─ rowOrder (Y.Array<id>)
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
	const tablesMap = ydoc.getMap('tables');

	for (const tableName of Object.keys(tableSchemas)) {
		const tableMap = new Y.Map();
		tableMap.set('rowsById', new Y.Map());
		tableMap.set('rowOrder', new Y.Array());
		tablesMap.set(tableName, tableMap);
	}

	return {
		/**
		 * Raw YJS document
		 * Exposed for advanced use cases (e.g., passing to indexes)
		 */
		ydoc,

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
			const ymap = new Y.Map();

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
			const tableMap = tablesMap.get(tableName);

			if (!tableMap) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			const rowsById = tableMap.get('rowsById') as Y.Map<Y.Map<YjsValue>>;

			// Use observeDeep to catch nested changes (fields inside rows)
			rowsById.observeDeep((events) => {
				for (const event of events) {
					// @ts-expect-error - YJS types don't expose changes.keys properly
					event.changes.keys.forEach((change: any, key: string) => {
						if (change.action === 'add') {
							const rowMap = rowsById.get(key);
							if (rowMap) {
								const data = convertYMapToPlain(rowMap);
								handlers.onAdd(key, data);
							}
						} else if (change.action === 'update') {
							const rowMap = rowsById.get(key);
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

		/**
		 * Get the rowsById map for a table
		 */
		getTableRowsById(tableName: string): Y.Map<Y.Map<YjsValue>> {
			const tableMap = tablesMap.get(tableName);

			if (!tableMap) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			return tableMap.get('rowsById') as Y.Map<Y.Map<YjsValue>>;
		},

		/**
		 * Get the rowOrder array for a table
		 */
		getTableRowOrder(tableName: string): Y.Array<string> {
			const tableMap = tablesMap.get(tableName);

			if (!tableMap) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}

			return tableMap.get('rowOrder') as Y.Array<string>;
		},
	};
}
