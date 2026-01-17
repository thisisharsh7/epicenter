/**
 * Workspace input normalization for developer ergonomics.
 *
 * This module provides types and functions to normalize minimal workspace inputs
 * into full workspace definitions with all metadata filled in.
 *
 * ## Two Input Shapes
 *
 * Developers can use either:
 * 1. **Minimal input** (WorkspaceInput) - just fields, no metadata
 * 2. **Full definition** (WorkspaceDefinition) - complete with name, icon, description
 *
 * The `normalizeWorkspace()` function accepts either and always returns a full definition.
 *
 * ## All-or-Nothing Rule
 *
 * A workspace is either entirely minimal (all tables are just fields) or entirely
 * full (all tables have metadata). No mixing allowed.
 *
 * @example Minimal input
 * ```typescript
 * const input: WorkspaceInput = {
 *   id: 'epicenter.blog',
 *   tables: {
 *     posts: { id: id(), title: text(), published: boolean() },
 *   },
 *   kv: {},
 * };
 *
 * const definition = normalizeWorkspace(input);
 * // definition.name === 'Epicenter blog'
 * // definition.tables.posts.name === 'Posts'
 * // definition.tables.posts.icon === { type: 'emoji', value: '📄' }
 * ```
 *
 * @module
 */

import humanizeString from 'humanize-string';
import type {
	FieldSchemaMap,
	IconDefinition,
	KvDefinition,
	KvDefinitionMap,
	KvFieldSchema,
	TableDefinition,
	TableDefinitionMap,
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
// Input Types (Minimal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal table input - just fields, no metadata.
 *
 * When using minimal input, table name/icon/description are auto-generated:
 * - `name`: humanized from the table key (e.g., "blogPosts" → "Blog posts")
 * - `icon`: default emoji 📄
 * - `description`: empty string
 * - `cover`: null
 *
 * @example
 * ```typescript
 * const postsTable: TableInput = {
 *   id: id(),
 *   title: text(),
 *   published: boolean({ default: false }),
 * };
 * ```
 */
export type TableInput<TFields extends FieldSchemaMap = FieldSchemaMap> =
	TFields;

/**
 * Minimal KV input - just the field schema, no metadata.
 *
 * When using minimal input, KV name/icon/description are auto-generated:
 * - `name`: humanized from the key (e.g., "darkMode" → "Dark mode")
 * - `icon`: default emoji ⚙️
 * - `description`: empty string
 *
 * @example
 * ```typescript
 * const themeKv: KvInput = select({ options: ['light', 'dark'], default: 'light' });
 * ```
 */
export type KvInput<TField extends KvFieldSchema = KvFieldSchema> = TField;

/**
 * Map of KV key names to their minimal input (just field schemas).
 */
export type KvInputMap = Record<string, KvInput>;

/**
 * Minimal workspace input - ID + tables (fields only) + kv (fields only).
 *
 * No `name` property. The workspace name is auto-generated from the ID.
 *
 * @example
 * ```typescript
 * const input: WorkspaceInput = {
 *   id: 'epicenter.whispering',
 *   tables: {
 *     recordings: { id: id(), title: text(), transcript: text() },
 *     transformations: { id: id(), name: text(), prompt: text() },
 *   },
 *   kv: {},
 * };
 * ```
 */
export type WorkspaceInput<
	TTableInputMap extends Record<string, TableInput> = Record<
		string,
		TableInput
	>,
	TKvInputMap extends KvInputMap = KvInputMap,
> = {
	/** Locally-scoped identifier (e.g., "epicenter.whispering") */
	id: string;
	/** Tables as minimal input (fields only, no metadata) */
	tables: TTableInputMap;
	/** KV store as minimal input (field schemas only, no metadata) */
	kv: TKvInputMap;
};

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a table value is a full TableDefinition (has metadata).
 *
 * Detection: TableDefinition has a `fields` property; TableInput doesn't.
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
export function isTableDefinition<TFields extends FieldSchemaMap>(
	value: TableInput<TFields> | TableDefinition<TFields>,
): value is TableDefinition<TFields> {
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
 * Detection: KvDefinition has a `field` property; KvInput doesn't.
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
export function isKvDefinition<TField extends KvFieldSchema>(
	value: KvInput<TField> | KvDefinition<TField>,
): value is KvDefinition<TField> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'field' in value &&
		'name' in value
	);
}

/**
 * Check if a workspace config is a full WorkspaceDefinition (has `name` property).
 *
 * This is the primary detection mechanism: WorkspaceInput has no `name`,
 * WorkspaceDefinition requires `name`.
 *
 * @example
 * ```typescript
 * const input = { id: 'blog', tables: { posts: { id: id() } }, kv: {} };
 * isWorkspaceDefinition(input); // false
 *
 * const def = { id: 'blog', name: 'Blog', tables: {...}, kv: {} };
 * isWorkspaceDefinition(def); // true
 * ```
 */
export function isWorkspaceDefinition(
	value: WorkspaceInput | WorkspaceDefinitionShape,
): value is WorkspaceDefinitionShape {
	return typeof value === 'object' && value !== null && 'name' in value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalization Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a table input to a full table definition.
 *
 * @param key - The table key (used for humanized name)
 * @param input - Either minimal input (fields only) or full definition
 * @returns Full TableDefinition with all metadata
 *
 * @example
 * ```typescript
 * const input = { id: id(), title: text() };
 * const def = normalizeTable('blogPosts', input);
 * // def.name === 'Blog posts'
 * // def.icon === { type: 'emoji', value: '📄' }
 * // def.cover === null
 * // def.description === ''
 * // def.fields === { id: id(), title: text() }
 * ```
 */
export function normalizeTable<TFields extends FieldSchemaMap>(
	key: string,
	input: TableInput<TFields> | TableDefinition<TFields>,
): TableDefinition<TFields> {
	if (isTableDefinition(input)) {
		return input;
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
 * @param key - The KV key (used for humanized name)
 * @param input - Either minimal input (field only) or full definition
 * @returns Full KvDefinition with all metadata
 *
 * @example
 * ```typescript
 * const input = select({ options: ['light', 'dark'] });
 * const def = normalizeKv('darkMode', input);
 * // def.name === 'Dark mode'
 * // def.icon === { type: 'emoji', value: '⚙️' }
 * // def.description === ''
 * // def.field === select({ options: ['light', 'dark'] })
 * ```
 */
export function normalizeKv<TField extends KvFieldSchema>(
	key: string,
	input: KvInput<TField> | KvDefinition<TField>,
): KvDefinition<TField> {
	if (isKvDefinition(input)) {
		return input;
	}

	return {
		name: humanizeString(key),
		icon: DEFAULT_KV_ICON,
		description: '',
		field: input,
	};
}

/**
 * Internal type for WorkspaceDefinition shape (used in type guards).
 * This matches the shape of WorkspaceDefinition from workspace.ts.
 */
type WorkspaceDefinitionShape = {
	id: string;
	name: string;
	tables: TableDefinitionMap;
	kv: KvDefinitionMap;
};

/**
 * Normalize a workspace input to a full workspace definition.
 *
 * Accepts either:
 * - Minimal input (WorkspaceInput) - just id, tables (fields), kv (fields)
 * - Full definition (WorkspaceDefinition) - complete with name, metadata
 *
 * When given minimal input:
 * - `name`: humanized from ID (e.g., "epicenter.whispering" → "Epicenter whispering")
 * - All tables normalized with default metadata
 * - All KV entries normalized with default metadata
 *
 * @example Minimal input
 * ```typescript
 * const input = {
 *   id: 'epicenter.whispering',
 *   tables: { recordings: { id: id(), title: text() } },
 *   kv: {},
 * };
 *
 * const def = normalizeWorkspace(input);
 * // def.id === 'epicenter.whispering'
 * // def.name === 'Epicenter whispering'
 * // def.tables.recordings.name === 'Recordings'
 * ```
 *
 * @example Full definition (pass-through)
 * ```typescript
 * const def = {
 *   id: 'epicenter.whispering',
 *   name: 'Whispering',
 *   tables: { ... },
 *   kv: {},
 * };
 *
 * normalizeWorkspace(def) === def; // true (unchanged)
 * ```
 */
export function normalizeWorkspace<
	TTables extends Record<string, TableInput | TableDefinition>,
	TKv extends Record<string, KvInput | KvDefinition>,
>(
	input: { id: string; tables: TTables; kv: TKv } & (
		| { name?: undefined }
		| { name: string }
	),
): WorkspaceDefinitionShape {
	// If already a full definition, return as-is
	if (
		isWorkspaceDefinition(input as WorkspaceInput | WorkspaceDefinitionShape)
	) {
		return input as WorkspaceDefinitionShape;
	}

	// Normalize all tables
	const tables: TableDefinitionMap = {};
	for (const [key, value] of Object.entries(input.tables)) {
		tables[key] = normalizeTable(key, value as TableInput | TableDefinition);
	}

	// Normalize all KV entries
	const kv: KvDefinitionMap = {};
	for (const [key, value] of Object.entries(input.kv)) {
		kv[key] = normalizeKv(key, value as KvInput | KvDefinition);
	}

	return {
		id: input.id,
		name: humanizeString(input.id),
		tables,
		kv,
	};
}
