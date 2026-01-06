import { diffChars } from 'diff';
import * as Y from 'yjs';
import type { PartialSerializedRow, TableSchema } from '../../core/schema';
import { isDateWithTimezoneString } from '../../core/schema';
import type { YRow } from '../tables/table-helper';

/**
 * Executes a function within a Yjs transaction if the type is attached to a document.
 *
 * ## Why wrap in transactions?
 *
 * Without transactions, each Y.Text.insert(), Y.Text.delete(), etc. creates its own
 * mini-transaction, triggering separate:
 * - `update` events
 * - Sync messages to peers
 * - Observer callbacks
 *
 * By wrapping multiple operations in a single transaction, all changes are batched
 * into one atomic update, significantly improving performance for operations that
 * make multiple modifications (like applying a diff).
 *
 * ## Nested transactions are safe
 *
 * Yjs handles nested `doc.transact()` calls gracefully - it batches everything into
 * the outermost transaction. So if `updateYRowFromSerializedRow` wraps in a transaction
 * and then calls `updateYTextFromString` (which also wraps), Yjs just uses the outer one.
 * This means each function can safely wrap its own operations without worrying about
 * whether the caller already wrapped.
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
 * Updates a Y.Text object to match a target string by computing and applying the minimal diff.
 *
 * Instead of replacing the entire Y.Text content, this function:
 * 1. Computes the character-level differences between the current state and target string
 * 2. Applies only the necessary insertions and deletions to transform the Y.Text
 * 3. Preserves CRDT character identity where possible for better collaborative editing
 *
 * All operations are wrapped in a transaction for efficiency (see {@link withTransaction}).
 *
 * @param yText - The Y.Text object to update
 * @param newString - The target string that Y.Text should become
 *
 * @example
 * ```typescript
 * const ydoc = new Y.Doc();
 * const ytext = ydoc.getText('content');
 *
 * // Initial state
 * ytext.insert(0, "Hello World");
 *
 * // Update to new string - only "Beautiful " is inserted
 * updateYTextFromString(ytext, "Hello Beautiful World");
 *
 * console.log(ytext.toString()); // "Hello Beautiful World"
 * ```
 */
export function updateYTextFromString(yText: Y.Text, newString: string): void {
	const currentString = yText.toString();

	// Early return if strings are identical
	if (currentString === newString) {
		return;
	}

	const diffs = diffChars(currentString, newString);

	withTransaction(yText, () => {
		let index = 0;

		for (const change of diffs) {
			if (change.added) {
				yText.insert(index, change.value);
				index += change.value.length;
			} else if (change.removed) {
				yText.delete(index, change.value.length);
				// Don't advance index - deleted content shifts remaining text left
			} else {
				// Characters match (unchanged), just advance position
				index += change.value.length;
			}
		}
	});
}

/**
 * Updates a YRow (Y.Map) to match a serialized row by converting values and applying minimal diffs.
 *
 * **No-op optimization**: If the serialized row matches the existing YRow exactly, no YJS
 * operations are performed. This means no CRDT items created, no observers triggered, and
 * no sync messages generated. The function compares values before setting:
 *
 * - **Y.Text fields**: Character-level diff via `updateYTextFromString()` (no-op if identical)
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
 * Extra fields in serializedRow (not in schema) are preserved as-is.
 *
 * All operations are wrapped in a transaction for efficiency (see {@link withTransaction}).
 *
 * @param yrow - The Y.Map to update (can be new or existing)
 * @param serializedRow - Plain JavaScript object with serialized values
 * @param schema - The table schema for type conversion
 *
 * @example
 * ```typescript
 * // Create new YRow
 * const yrow = new Y.Map();
 * updateYRowFromSerializedRow({
 *   yrow,
 *   serializedRow: { id: '123', content: 'Hello', tags: ['a', 'b'] },
 *   schema: mySchema
 * });
 *
 * // Update existing YRow
 * updateYRowFromSerializedRow({
 *   yrow,
 *   serializedRow: { id: '123', content: 'Hello World', tags: ['a', 'b', 'c'] },
 *   schema: mySchema
 * });
 * // Only 'content' and 'tags' are updated
 *
 * // No-op when nothing changed
 * updateYRowFromSerializedRow({
 *   yrow,
 *   serializedRow: { id: '123', content: 'Hello World', tags: ['a', 'b', 'c'] },
 *   schema: mySchema
 * });
 * // Nothing happens - no YJS operations, no observers triggered
 * ```
 */
export function updateYRowFromSerializedRow<TTableSchema extends TableSchema>({
	yrow,
	serializedRow,
	schema,
}: {
	yrow: YRow;
	serializedRow: PartialSerializedRow<TTableSchema>;
	schema: TTableSchema;
}): void {
	withTransaction(yrow, () => {
		for (const [fieldName, value] of Object.entries(serializedRow)) {
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
				columnSchema?.['x-component'] === 'ytext' &&
				typeof value === 'string'
			) {
				const ytext = existing instanceof Y.Text ? existing : new Y.Text();
				if (!(existing instanceof Y.Text)) {
					yrow.set(fieldName, ytext);
				}
				updateYTextFromString(ytext, value);
			} else if (
				columnSchema?.['x-component'] === 'date' &&
				isDateWithTimezoneString(value)
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
