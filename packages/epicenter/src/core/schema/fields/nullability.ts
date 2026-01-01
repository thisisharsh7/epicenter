import type { FieldSchema } from './types';

/**
 * Determine whether a field schema accepts `null`.
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
 * import { isNullableFieldSchema } from './nullability';
 *
 * if (!isNullableFieldSchema(schema)) {
 *   column = column.notNull();
 * }
 * ```
 */
export function isNullableFieldSchema(
	schema: Pick<FieldSchema, 'type'>,
): boolean {
	const { type } = schema;
	return Array.isArray(type) && (type as readonly unknown[]).includes('null');
}
