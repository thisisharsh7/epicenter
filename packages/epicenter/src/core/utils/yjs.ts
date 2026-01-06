import * as Y from 'yjs';
import type { PartialRowData, TableSchema } from '../../core/schema';
import { DateTimeString } from '../../core/schema';
import type { YRow } from '../tables/table-helper';

/**
 * Executes a function within a Yjs transaction if the type is attached to a document.
 *
 * ## Why wrap in transactions?
 *
 * Without transactions, each Y.Map.set() call creates its own mini-transaction,
 * triggering separate:
 * - `update` events
 * - Sync messages to peers
 * - Observer callbacks
 *
 * By wrapping multiple operations in a single transaction, all changes are batched
 * into one atomic update, significantly improving performance for operations that
 * make multiple modifications.
 *
 * ## Nested transactions are safe
 *
 * Yjs handles nested `doc.transact()` calls gracefully - it batches everything into
 * the outermost transaction. So if `updateYRowFromRowData` wraps in a transaction
 * and a caller also wraps, Yjs just uses the outer one. This means each function can
 * safely wrap its own operations without worrying about whether the caller already wrapped.
 *
 * @param yType - Any Yjs shared type (Y.Text, Y.Array, Y.Map, etc.)
 * @param fn - The function containing Yjs operations to execute
 */
function withTransaction(yType: { doc: Y.Doc | null }, fn: () => void): void {
	const { doc } = yType;
	if (doc) {
		doc.transact(fn);
	} else {
		// Type not yet attached to a doc, apply directly
		fn();
	}
}

/**
 * Updates a YRow (Y.Map) to match row data by comparing and applying minimal changes.
 *
 * **No-op optimization**: If the row data matches the existing YRow exactly, no YJS
 * operations are performed. This means no CRDT items created, no observers triggered, and
 * no sync messages generated. The function compares values before setting:
 *
 * - **Array fields**: Compared element-by-element before setting (no-op if identical)
 * - **Primitive fields**: Compared with `===` before calling `yrow.set()` (no-op if identical)
 * - **null values**: Compared before setting (no-op if already null)
 *
 * This makes the function safe to call repeatedly without generating unnecessary YJS traffic.
 * Use this for sync operations where you want to "upsert" without knowing if changes exist.
 *
 * This function handles two scenarios:
 * 1. Creating a new YRow: Pass a fresh Y.Map and it will be populated
 * 2. Updating an existing YRow: Pass an existing Y.Map and it will be updated with minimal changes
 *
 * Extra fields in rowData (not in schema) are preserved as-is.
 *
 * All operations are wrapped in a transaction for efficiency (see {@link withTransaction}).
 *
 * @param yrow - The Y.Map to update (can be new or existing)
 * @param rowData - Plain JavaScript object with row values
 * @param schema - The table schema for type conversion
 *
 * @example
 * ```typescript
 * // Create new YRow
 * const yrow = new Y.Map();
 * updateYRowFromRowData({
 *   yrow,
 *   rowData: { id: '123', title: 'Hello', tags: ['a', 'b'] },
 *   schema: mySchema
 * });
 *
 * // Update existing YRow - only changed fields are updated
 * updateYRowFromRowData({
 *   yrow,
 *   rowData: { id: '123', title: 'Hello World', tags: ['a', 'b', 'c'] },
 *   schema: mySchema
 * });
 *
 * // No-op when nothing changed
 * updateYRowFromRowData({
 *   yrow,
 *   rowData: { id: '123', title: 'Hello World', tags: ['a', 'b', 'c'] },
 *   schema: mySchema
 * });
 * // Nothing happens - no YJS operations, no observers triggered
 * ```
 */
export function updateYRowFromRowData<TTableSchema extends TableSchema>({
	yrow,
	rowData,
	schema,
}: {
	yrow: YRow;
	rowData: PartialRowData<TTableSchema>;
	schema: TTableSchema;
}): void {
	withTransaction(yrow, () => {
		for (const [fieldName, value] of Object.entries(rowData)) {
			if (value === undefined) continue;

			const existing = yrow.get(fieldName);

			if (value === null) {
				if (existing !== null) {
					yrow.set(fieldName, null);
				}
				continue;
			}

			const columnSchema = schema[fieldName];

			if (
				columnSchema?.['x-component'] === 'date' &&
				DateTimeString.is(value)
			) {
				if (existing !== value) {
					yrow.set(fieldName, value);
				}
			} else if (Array.isArray(value)) {
				// Store plain array directly - simple equality check
				const existingArray = existing as unknown[];
				const arraysEqual =
					Array.isArray(existing) &&
					existingArray.length === value.length &&
					existingArray.every((item, i) => item === value[i]);
				if (!arraysEqual) {
					yrow.set(fieldName, value);
				}
			} else {
				if (existing !== value) {
					yrow.set(fieldName, value);
				}
			}
		}
	});
}
