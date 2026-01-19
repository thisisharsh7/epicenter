/**
 * KV normalization utilities.
 *
 * This module provides:
 * - Icon normalization (string → IconDefinition)
 * - KV entry normalization
 * - Type guards for KV definitions
 * - Default icon constants
 *
 * Note: Table normalization has been removed. Tables now require explicit metadata
 * via the `table()` helper, which returns a fully normalized `TableDefinition`.
 *
 * @module
 */

import humanizeString from 'humanize-string';
import type {
	FieldSchemaMap,
	IconDefinition,
	KvDefinition,
	KvFieldSchema,
	TableDefinition,
} from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default icon for KV entries when using minimal input.
 */
export const DEFAULT_KV_ICON = {
	type: 'emoji',
	value: '⚙️',
} as const satisfies IconDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// Icon Normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize icon input to canonical IconDefinition | null.
 *
 * - string → `{ type: 'emoji', value: string }`
 * - undefined → null
 * - null → null
 * - IconDefinition → unchanged
 *
 * @example
 * ```typescript
 * normalizeIcon('📝');           // { type: 'emoji', value: '📝' }
 * normalizeIcon({ type: 'emoji', value: '📝' }); // unchanged
 * normalizeIcon(undefined);      // null
 * normalizeIcon(null);           // null
 * ```
 */
export function normalizeIcon(
	icon: string | IconDefinition | null | undefined,
): IconDefinition | null {
	if (icon === undefined || icon === null) return null;
	if (typeof icon === 'string') return { type: 'emoji', value: icon };
	return icon;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a value is a TableDefinition.
 *
 * Detection: TableDefinition has `fields` and `name` properties.
 *
 * @example
 * ```typescript
 * const tableDef = table({ name: 'Posts', fields: { id: id() } });
 * isTableDefinition(tableDef); // true
 *
 * const notTable = { id: id(), title: text() };
 * isTableDefinition(notTable); // false
 * ```
 */
export function isTableDefinition(
	value: unknown,
): value is TableDefinition<FieldSchemaMap> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'fields' in value &&
		'name' in value
	);
}

/**
 * Check if a KV value is a full KvDefinition (has metadata).
 *
 * Detection: KvDefinition has `field` and `name` properties.
 *
 * @example
 * ```typescript
 * const kv = select({ options: ['light', 'dark'] });
 * isKvDefinition(kv); // false
 *
 * const kvDef = { name: 'Theme', icon: null, description: '', field: select({ options: ['light', 'dark'] }) };
 * isKvDefinition(kvDef); // true
 * ```
 */
export function isKvDefinition(
	value: unknown,
): value is KvDefinition<KvFieldSchema> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'field' in value &&
		'name' in value
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a KV input to a full KV definition.
 *
 * Accepts either:
 * - Minimal input (just field schema) → adds default metadata
 * - Full definition → passes through unchanged
 *
 * @param key - The KV key (used for humanized name if minimal)
 * @param input - Either minimal input (field only) or full definition
 * @returns Full KvDefinition with all metadata
 *
 * @example
 * ```typescript
 * const input = select({ options: ['light', 'dark'] });
 * const def = normalizeKv('darkMode', input);
 * // def.name === 'Dark mode'
 * // def.icon === { type: 'emoji', value: '⚙️' }
 * // def.field === select({ options: ['light', 'dark'] })
 * ```
 */
export function normalizeKv<TField extends KvFieldSchema>(
	key: string,
	input: TField | KvDefinition<TField>,
): KvDefinition<TField> {
	if (isKvDefinition(input)) {
		return input as KvDefinition<TField>;
	}

	return {
		name: humanizeString(key),
		icon: DEFAULT_KV_ICON,
		description: '',
		field: input,
	};
}
