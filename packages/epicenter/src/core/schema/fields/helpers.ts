/**
 * @fileoverview Field schema helper functions
 *
 * Utility functions for introspecting field schemas. These helpers answer
 * questions about schema properties without transforming them to other formats.
 *
 * For format conversions (arktype, drizzle, typebox), see `../converters/`.
 */

import type { FieldSchema } from './types';

/**
 * Determines if a field schema is nullable.
 *
 * Nullability rules:
 * - `id`: Never nullable (primary key)
 * - `richtext`: Always nullable (Y.Doc created lazily)
 * - All others: Check the `nullable` property
 *
 * @example
 * ```typescript
 * isNullableFieldSchema({ type: 'text' });                    // false
 * isNullableFieldSchema({ type: 'text', nullable: true });    // true
 * isNullableFieldSchema({ type: 'id' });                      // false (always)
 * isNullableFieldSchema({ type: 'richtext' });                // true (always)
 * ```
 */
export function isNullableFieldSchema(
	schema: Pick<FieldSchema, 'type'> & { nullable?: boolean },
): boolean {
	if (schema.type === 'id') return false;
	if (schema.type === 'richtext') return true;
	return schema.nullable === true;
}
