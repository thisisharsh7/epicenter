/**
 * @fileoverview Serialization utilities for converting between CellValue and SerializedCellValue
 *
 * With JSON-serializable rows, CellValue and SerializedCellValue are now identical types.
 * All values stored in YJS rows are plain JavaScript values (no embedded CRDTs).
 *
 * - Rich text content is stored as an ID reference (string) pointing to a separate Y.Doc
 * - Tags are stored as plain arrays (string[])
 * - All other types are primitives (string, number, boolean, null)
 */

import type {
	CellValue,
	FieldSchema,
	SerializedCellValue,
} from '../fields/types';

/**
 * Serializes a cell value to its JSON-serializable equivalent.
 *
 * With JSON-serializable rows, this is now an identity function since
 * CellValue === SerializedCellValue (no CRDT types embedded in rows).
 *
 * All values are already plain JavaScript types:
 * - string, number, boolean, null for primitives
 * - string[] for tags
 * - string (ID reference) for richtext
 * - DateWithTimezoneString for dates
 *
 * @example
 * ```typescript
 * serializeCellValue('Hello');           // 'Hello'
 * serializeCellValue(42);                // 42
 * serializeCellValue(['a', 'b', 'c']);   // ['a', 'b', 'c']
 * serializeCellValue('rtxt_abc123');     // 'rtxt_abc123' (richtext ID)
 * serializeCellValue(null);              // null
 * ```
 */
export function serializeCellValue<T extends FieldSchema>(
	value: CellValue<T>,
): SerializedCellValue<T> {
	return value as SerializedCellValue<T>;
}
