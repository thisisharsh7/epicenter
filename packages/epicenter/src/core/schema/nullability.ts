import type { ColumnSchema } from './types';

/**
 * Determine whether a column schema accepts `null`.
 *
 * Epicenter encodes nullability using native JSON Schema unions:
 * - Non-nullable: `type: 'string'`
 * - Nullable: `type: ['string', 'null']`
 *
 * We check specifically for `'null'` in the type array rather than just
 * `Array.isArray(type)` because JSON Schema allows non-nullable unions
 * (e.g., `['string', 'number']`).
 *
 * @example
 * ```typescript
 * import { isNullableColumnSchema } from './nullability';
 *
 * if (!isNullableColumnSchema(schema)) {
 *   column = column.notNull();
 * }
 * ```
 */
export function isNullableColumnSchema(
	schema: Pick<ColumnSchema, 'type'>,
): boolean {
	const { type } = schema;
	return Array.isArray(type) && (type as readonly unknown[]).includes('null');
}
