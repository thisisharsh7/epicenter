/**
 * Table and KV normalization utilities.
 *
 * This module provides:
 * - Type guards for detecting full definitions vs minimal inputs
 * - Atomic normalizers for tables and KV entries
 * - Default icon constants
 *
 * The workspace-level normalization is handled by `defineWorkspace()` in workspace.ts.
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
 * Default icon for tables when using minimal input.
 */
export const DEFAULT_TABLE_ICON = {
	type: 'emoji',
	value: '📄',
} as const satisfies IconDefinition;

/**
 * Default icon for KV entries when using minimal input.
 */
export const DEFAULT_KV_ICON = {
	type: 'emoji',
	value: '⚙️',
} as const satisfies IconDefinition;

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a table value is a full TableDefinition (has metadata).
 *
 * Detection: TableDefinition has `fields` and `name` properties.
 *
 * @example
 * ```typescript
 * const table = { id: id(), title: text() };
 * isTableDefinition(table); // false
 *
 * const tableDef = { name: 'Posts', icon: null, cover: null, description: '', fields: { id: id() } };
 * isTableDefinition(tableDef); // true
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
 * Normalize a table input to a full table definition.
 *
 * Accepts either:
 * - Minimal input (just fields) → adds default metadata
 * - Full definition → passes through unchanged
 *
 * @param key - The table key (used for humanized name if minimal)
 * @param input - Either minimal input (fields only) or full definition
 * @returns Full TableDefinition with all metadata
 *
 * @example
 * ```typescript
 * const input = { id: id(), title: text() };
 * const def = normalizeTable('blogPosts', input);
 * // def.name === 'Blog posts'
 * // def.icon === { type: 'emoji', value: '📄' }
 * // def.fields === { id: id(), title: text() }
 * ```
 */
export function normalizeTable<TFields extends FieldSchemaMap>(
	key: string,
	input: TFields | TableDefinition<TFields>,
): TableDefinition<TFields> {
	if (isTableDefinition(input)) {
		return input as TableDefinition<TFields>;
	}

	return {
		name: humanizeString(key),
		icon: DEFAULT_TABLE_ICON,
		cover: null,
		description: '',
		fields: input,
	};
}

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
