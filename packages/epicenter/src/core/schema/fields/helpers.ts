/**
 * @fileoverview Field helper functions
 *
 * Utility functions for introspecting fields. These helpers answer
 * questions about field properties without transforming them to other formats.
 *
 * For format conversions (arktype, drizzle, typebox), see `../converters/`.
 */

import type { Field } from './types';

/**
 * Determines if a field is nullable.
 *
 * Nullability rules:
 * - `id`: Never nullable (primary key)
 * - `richtext`: Always nullable (Y.Doc created lazily)
 * - All others: Check the `nullable` property
 *
 * @example
 * ```typescript
 * isNullableField({ type: 'text' });                    // false
 * isNullableField({ type: 'text', nullable: true });    // true
 * isNullableField({ type: 'id' });                      // false (always)
 * isNullableField({ type: 'richtext' });                // true (always)
 * ```
 */
export function isNullableField(
	schema: Pick<Field, 'type'> & { nullable?: boolean },
): boolean {
	if (schema.type === 'id') return false;
	if (schema.type === 'richtext') return true;
	return schema.nullable === true;
}
