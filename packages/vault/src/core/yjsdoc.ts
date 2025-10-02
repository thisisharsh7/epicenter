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
 * Initialize a YJS document for a workspace with the given table schemas
 * Creates the structure:
 *   ydoc
 *     └─ tables (Y.Map)
 *         └─ tableName (Y.Map)
 *             ├─ rowsById (Y.Map<id, Y.Map<field, value>>)
 *             └─ rowOrder (Y.Array<id>)
 */
export function initWorkspaceDoc(
	workspaceId: string,
	tableSchemas: Record<string, TableSchema>,
): Y.Doc {
	const ydoc = new Y.Doc({ guid: workspaceId });
	const tablesMap = ydoc.getMap('tables');

	for (const tableName of Object.keys(tableSchemas)) {
		const tableMap = new Y.Map();
		tableMap.set('rowsById', new Y.Map());
		tableMap.set('rowOrder', new Y.Array());
		tablesMap.set(tableName, tableMap);
	}

	return ydoc;
}

/**
 * Convert a Y.Map (row) to a plain JavaScript object
 * Handles special types:
 * - Y.Text → string
 * - Y.Array → plain array
 * - Y.Map → nested plain object (recursive)
 * - Primitives → as-is
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
 * Convert a plain JavaScript object to a Y.Map (row)
 * Uses column schemas to determine which fields should be Y.Text
 */
export function convertPlainToYMap(
	data: RowData,
	columnSchemas: TableSchema,
): Y.Map<YjsValue> {
	const ymap = new Y.Map();

	for (const [key, value] of Object.entries(data)) {
		const schema = columnSchemas[key];

		if (schema?.type === 'rich-text') {
			// Rich text column → Y.Text for collaborative editing
			ymap.set(key, new Y.Text(value as string));
		} else {
			// All other types → store as-is (including DateWithTimezone objects)
			ymap.set(key, value);
		}
	}

	return ymap;
}

/**
 * Set up observers for a table to trigger index updates
 * Uses observeDeep to catch both row-level and field-level changes
 */
export function observeTable(
	ydoc: Y.Doc,
	tableName: string,
	handlers: {
		onAdd: (id: string, data: RowData) => void | Promise<void>;
		onUpdate: (id: string, data: RowData) => void | Promise<void>;
		onDelete: (id: string) => void | Promise<void>;
	},
) {
	const tablesMap = ydoc.getMap('tables');
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
}

/**
 * Get the rowsById map for a table
 */
export function getTableRowsById(
	ydoc: Y.Doc,
	tableName: string,
): Y.Map<Y.Map<YjsValue>> {
	const tablesMap = ydoc.getMap('tables');
	const tableMap = tablesMap.get(tableName);

	if (!tableMap) {
		throw new Error(`Table "${tableName}" not found in YJS document`);
	}

	return tableMap.get('rowsById') as Y.Map<Y.Map<YjsValue>>;
}

/**
 * Get the rowOrder array for a table
 */
export function getTableRowOrder(
	ydoc: Y.Doc,
	tableName: string,
): Y.Array<string> {
	const tablesMap = ydoc.getMap('tables');
	const tableMap = tablesMap.get(tableName);

	if (!tableMap) {
		throw new Error(`Table "${tableName}" not found in YJS document`);
	}

	return tableMap.get('rowOrder') as Y.Array<string>;
}
