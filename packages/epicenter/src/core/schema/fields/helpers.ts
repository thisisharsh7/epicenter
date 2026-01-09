/**
 * @fileoverview Field definition helper functions
 *
 * Utility functions for introspecting field definitions. These helpers answer
 * questions about definition properties without transforming them to other formats.
 *
 * For format conversions (arktype, drizzle, typebox), see `../converters/`.
 */

import type { FieldDefinition } from './types';

/**
 * Determines if a field definition is nullable.
 *
 * Nullability rules:
 * - `id`: Never nullable (primary key)
 * - `richtext`: Always nullable (Y.Doc created lazily)
 * - All others: Check the `nullable` property
 *
 * @example
 * ```typescript
 * isNullableFieldDefinition({ type: 'text' });                    // false
 * isNullableFieldDefinition({ type: 'text', nullable: true });    // true
 * isNullableFieldDefinition({ type: 'id' });                      // false (always)
 * isNullableFieldDefinition({ type: 'richtext' });                // true (always)
 * ```
 */
export function isNullableFieldDefinition(
	definition: Pick<FieldDefinition, 'type'> & { nullable?: boolean },
): boolean {
	if (definition.type === 'id') return false;
	if (definition.type === 'richtext') return true;
	return definition.nullable === true;
}
