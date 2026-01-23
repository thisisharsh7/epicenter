/**
 * @fileoverview Core field type definitions
 *
 * Contains the foundational types for the schema system:
 * - Field types (IdField, TextField, etc.)
 * - Table and workspace schemas
 * - Row value types (CellValue, Row, PartialRow)
 *
 * ## Field Structure
 *
 * Each field is a minimal object with `type` as the discriminant:
 * - `type`: Field type ('text', 'select', 'tags', etc.)
 * - `nullable`: Optional boolean for nullability
 * - Type-specific fields (e.g., `options` for select/tags)
 *
 * This is a Notion-like format optimized for user configuration and storage.
 * JSON Schema can be derived on-demand for MCP/OpenAPI export.
 *
 * ## Nullability
 *
 * Nullability is encoded in a simple boolean `nullable` field:
 * - Non-nullable: `nullable` omitted or `false`
 * - Nullable: `nullable: true`
 *
 * Special cases:
 * - `id`: Never nullable (implicit)
 * - `richtext`: Always nullable (implicit)
 *
 * ## Related Files
 *
 * - `factories.ts` - Factory functions for creating fields
 * - `../converters/` - Converters for arktype, drizzle, typebox
 * - `helpers.ts` - isNullableField helper
 */

import type { Static, TSchema } from 'typebox';
import type { DateTimeString } from './datetime';

// ============================================================================
// Icon and Cover Definitions (Forward Compatible)
// ============================================================================

/**
 * Icon definition - emoji or external image URL.
 * Uses discriminated union for future extensibility.
 *
 * @example
 * ```typescript
 * // Emoji icon
 * { type: 'emoji', value: '📝' }
 *
 * // External image
 * { type: 'external', url: 'https://example.com/icon.png' }
 * ```
 */
export type IconDefinition =
	| { type: 'emoji'; value: string }
	| { type: 'external'; url: string };

/**
 * Cover definition - external image URL for table banners.
 * Uses discriminated union for future extensibility (gradients, unsplash, etc).
 *
 * @example
 * ```typescript
 * { type: 'external', url: 'https://example.com/cover.jpg' }
 * ```
 */
export type CoverDefinition = { type: 'external'; url: string };

// ============================================================================
// Field Metadata
// ============================================================================

/**
 * Metadata for individual fields (columns) in a table.
 *
 * Every field schema includes these properties for Notion-like UI display,
 * where each column can have its own display name, icon, and description.
 * Factory functions provide sensible defaults (empty string, null icon).
 *
 * ```
 * TableDefinition
 * ├── name, icon, description    ← TableMetadata (table-level)
 * └── fields
 *     ├── "id"
 *     │   ├── name, icon, description  ← FieldMetadata (column-level)
 *     │   └── type: "id"
 *     └── "title"
 *         ├── name, icon, description  ← FieldMetadata (column-level)
 *         ├── type: "text"
 *         └── nullable: false
 * ```
 *
 * @example
 * ```typescript
 * // Field with custom metadata
 * const titleField = text({
 *   name: 'Post Title',
 *   icon: { type: 'emoji', value: '📝' },
 *   description: 'The main title displayed on the blog',
 * });
 *
 * // Field with defaults (name: '', icon: null, description: '')
 * const simpleField = text();
 * ```
 */
export type FieldMetadata = {
	/** Display name shown in UI. Empty string if not provided. */
	name: string;
	/** Description shown in tooltips/docs. Empty string if not provided. */
	description: string;
	/** Icon for the field - emoji or external image URL. */
	icon: IconDefinition | null;
};

/**
 * Options for field factory functions.
 * All metadata fields are optional; factories provide defaults.
 */
export type FieldOptions = {
	/** Display name shown in UI. Defaults to empty string. */
	name?: string;
	/** Description shown in tooltips/docs. Defaults to empty string. */
	description?: string;
	/** Icon for the field. Defaults to null. */
	icon?: IconDefinition | null;
};

// ============================================================================
// Field Schema Types
// ============================================================================

/**
 * ID field - auto-generated primary key.
 * Always NOT NULL (implicit, no nullable field needed).
 */
export type IdField = FieldMetadata & {
	type: 'id';
};

/**
 * Text field - single-line string input.
 */
export type TextField<TNullable extends boolean = boolean> = FieldMetadata & {
	type: 'text';
	nullable?: TNullable;
	default?: string;
};

/**
 * Rich text reference field - stores ID pointing to separate rich content document.
 * The ID references a separate Y.Doc for collaborative editing.
 * The row itself just stores the string ID (JSON-serializable).
 *
 * Always nullable - Y.Docs are created lazily when user first edits.
 * No need to specify nullable or default; they're implicit.
 */
export type RichtextField = FieldMetadata & {
	type: 'richtext';
};

/**
 * Integer field - whole numbers.
 */
export type IntegerField<TNullable extends boolean = boolean> =
	FieldMetadata & {
		type: 'integer';
		nullable?: TNullable;
		default?: number;
	};

/**
 * Real/float field - decimal numbers.
 */
export type RealField<TNullable extends boolean = boolean> = FieldMetadata & {
	type: 'real';
	nullable?: TNullable;
	default?: number;
};

/**
 * Boolean field - true/false values.
 */
export type BooleanField<TNullable extends boolean = boolean> =
	FieldMetadata & {
		type: 'boolean';
		nullable?: TNullable;
		default?: boolean;
	};

/**
 * Date field - timezone-aware dates.
 * Stored as DateTimeString format: `{iso}|{timezone}`.
 */
export type DateField<TNullable extends boolean = boolean> = FieldMetadata & {
	type: 'date';
	nullable?: TNullable;
	default?: DateTimeString;
};

/**
 * Select field - single choice from predefined options.
 *
 * @example
 * ```typescript
 * {
 *   type: 'select',
 *   options: ['draft', 'published', 'archived'],
 *   default: 'draft'
 * }
 * ```
 */
export type SelectField<
	TOptions extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
	TNullable extends boolean = boolean,
> = FieldMetadata & {
	type: 'select';
	options: TOptions;
	nullable?: TNullable;
	default?: TOptions[number];
};

/**
 * Tags field - array of strings with optional validation.
 * Stored as plain arrays (JSON-serializable).
 *
 * Two modes:
 * - With `options`: Only values from options are allowed
 * - Without `options`: Any string array is allowed
 *
 * @example
 * ```typescript
 * // Validated tags
 * { type: 'tags', options: ['urgent', 'normal', 'low'] }
 *
 * // Unconstrained tags
 * { type: 'tags' }
 * ```
 */
export type TagsField<
	TOptions extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
	TNullable extends boolean = boolean,
> = FieldMetadata & {
	type: 'tags';
	options?: TOptions;
	nullable?: TNullable;
	default?: TOptions[number][];
};

/**
 * JSON field - arbitrary JSON validated by a TypeBox schema.
 *
 * The `schema` property holds a TypeBox schema (TSchema), which IS JSON Schema.
 * TypeBox schemas are plain JSON objects that can be:
 * - Stored directly in Y.Doc (no conversion needed)
 * - Compiled to JIT validators using `Compile()` from `typebox/compile`
 * - Used for TypeScript type inference via `Static<typeof schema>`
 *
 * @example
 * ```typescript
 * import { Type } from 'typebox';
 *
 * {
 *   type: 'json',
 *   schema: Type.Object({ theme: Type.String(), darkMode: Type.Boolean() }),
 *   default: { theme: 'dark', darkMode: true }
 * }
 * ```
 */
export type JsonField<
	T extends TSchema = TSchema,
	TNullable extends boolean = boolean,
> = FieldMetadata & {
	type: 'json';
	schema: T;
	nullable?: TNullable;
	default?: Static<T>;
};

// ============================================================================
// Discriminated Unions and Utility Types
// ============================================================================

/**
 * Discriminated union of all field definition types.
 * Use `type` to narrow to a specific type.
 */
export type Field =
	| IdField
	| TextField
	| RichtextField
	| IntegerField
	| RealField
	| BooleanField
	| DateField
	| SelectField
	| TagsField
	| JsonField;

/**
 * Extract the type name from a field definition.
 * One of: 'id', 'text', 'richtext', 'integer', 'real', 'boolean', 'date', 'select', 'tags', 'json'
 */
export type FieldType = Field['type'];

// ============================================================================
// Value Types
// ============================================================================

/**
 * Helper type to check if a field definition is nullable.
 *
 * Uses optional property check `{ nullable?: true }` because field definitions
 * define `nullable?: TNullable` (optional). When `TNullable = true`, the type
 * is `nullable?: true` which doesn't extend `{ nullable: true }` (required).
 *
 * This also correctly handles RichtextField (no nullable property)
 * because optional properties can be absent.
 */
type IsNullable<C extends Field> = C extends { nullable?: true } ? true : false;

/**
 * Maps a field definition to its runtime value type.
 *
 * - RichtextField → string | null (always nullable)
 * - TagsField → string[] (plain array)
 * - DateField → DateTimeString
 * - Other fields → primitive types
 *
 * Nullability is derived from the definition's `nullable` field.
 */
export type CellValue<C extends Field = Field> = C extends IdField
	? string
	: C extends TextField
		? IsNullable<C> extends true
			? string | null
			: string
		: C extends RichtextField
			? string | null // always nullable
			: C extends IntegerField
				? IsNullable<C> extends true
					? number | null
					: number
				: C extends RealField
					? IsNullable<C> extends true
						? number | null
						: number
					: C extends BooleanField
						? IsNullable<C> extends true
							? boolean | null
							: boolean
						: C extends DateField
							? IsNullable<C> extends true
								? DateTimeString | null
								: DateTimeString
							: C extends SelectField<infer TOptions>
								? IsNullable<C> extends true
									? TOptions[number] | null
									: TOptions[number]
								: C extends TagsField<infer TOptions>
									? IsNullable<C> extends true
										? TOptions[number][] | null
										: TOptions[number][]
									: C extends JsonField<infer T extends TSchema>
										? IsNullable<C> extends true
											? Static<T> | null
											: Static<T>
										: never;

// ============================================================================
// Table Schema Types
// ============================================================================

/**
 * Field definitions - maps field names to field definitions.
 * Must always include an 'id' field with IdField.
 *
 * @example
 * ```typescript
 * const postsFields = {
 *   id: id(),
 *   title: text(),
 *   status: select({ options: ['draft', 'published'] }),
 * } satisfies FieldMap;
 * ```
 */
export type FieldMap = { id: IdField } & Record<string, Field>;

/**
 * Table definition with metadata for UI display.
 * This is the **normalized** output type created by the `table()` factory function.
 *
 * @example
 * ```typescript
 * const postsTable: TableDefinition = {
 *   name: 'Posts',
 *   description: 'Blog posts and articles',
 *   icon: { type: 'emoji', value: '📝' },
 *   fields: {
 *     id: id(),
 *     title: text(),
 *     status: select({ options: ['draft', 'published'] }),
 *   },
 * };
 * ```
 */
export type TableDefinition<TFields extends FieldMap = FieldMap> = {
	/** Required display name shown in UI (e.g., "Blog Posts") */
	name: string;
	/** Required description shown in tooltips/docs */
	description: string;
	/** Icon for the table - normalized to IconDefinition | null */
	icon: IconDefinition | null;
	/** Field schema map for this table */
	fields: TFields;
};

/**
 * Map of table names to their full definitions (metadata + fields).
 *
 * This is the normalized format that flows through the entire system
 * (capabilities, table helpers, etc.). Created using the `table()` factory
 * function for each table.
 *
 * @example
 * ```typescript
 * const blogTables: TableDefinitionMap = {
 *   posts: {
 *     name: 'Posts',
 *     description: 'Blog posts',
 *     icon: { type: 'emoji', value: '📝' },
 *     fields: { id: id(), title: text() },
 *   },
 * };
 * ```
 */
export type TableDefinitionMap = Record<string, TableDefinition>;

// ============================================================================
// Row Types
// ============================================================================

/**
 * Plain object representing a complete table row.
 *
 * Row is the unified type for both reads and writes. All values are plain
 * JSON-serializable primitives (no Y.js types, no methods, no proxy behavior).
 *
 * @example
 * ```typescript
 * // Write: pass a Row to upsert
 * tables.posts.upsert({
 *   id: generateId(),
 *   title: 'Hello World',
 *   published: false,
 * });
 *
 * // Read: get returns a Row (wrapped in RowResult for validation)
 * const result = tables.posts.get({ id: '1' });
 * if (result.status === 'valid') {
 *   const row: Row = result.row;
 *   console.log(row.title);
 * }
 *
 * // Rows are JSON-serializable
 * const json = JSON.stringify(row);
 * ```
 */
export type Row<TFieldMap extends FieldMap = FieldMap> = {
	[K in keyof TFieldMap]: CellValue<TFieldMap[K]>;
};

/**
 * Partial row for updates. ID is required, all other fields are optional.
 *
 * Use PartialRow with `update()` when you only want to change specific fields
 * without providing the entire row. Fields not included are left unchanged.
 *
 * @example
 * ```typescript
 * // Update only the title, leave other fields unchanged
 * tables.posts.update({ id: '1', title: 'New Title' });
 *
 * // Update multiple fields
 * tables.posts.update({
 *   id: '1',
 *   title: 'Updated',
 *   published: true,
 * });
 * ```
 */
export type PartialRow<TFieldMap extends FieldMap = FieldMap> = {
	id: string;
} & Partial<Omit<Row<TFieldMap>, 'id'>>;

// ============================================================================
// Key-Value Schema Types
// ============================================================================

/**
 * Field definition for KV stores (excludes IdField).
 * KV entries don't have IDs; they're keyed by string.
 */
export type KvField = Exclude<Field, IdField>;

/**
 * Runtime value type for a KV entry.
 */
export type KvValue<C extends KvField = KvField> = CellValue<C>;

/**
 * KV entry definition with metadata for UI display.
 *
 * Parallel to TableDefinition, but wraps a single field instead of a fields map.
 * Conceptually, a KV store is like a single row where each key is a column.
 *
 * @example
 * ```typescript
 * const themeKv: KvDefinition = {
 *   name: 'Theme',
 *   icon: { type: 'emoji', value: '🎨' },
 *   description: 'Application color theme',
 *   field: select({ options: ['light', 'dark'] }),
 * };
 * ```
 */
export type KvDefinition<TField extends KvField = KvField> = {
	/** Display name shown in UI (e.g., "Theme") */
	name: string;
	/** Icon for this KV entry - emoji or external image URL */
	icon: IconDefinition | null;
	/** Description shown in tooltips/docs */
	description: string;
	/** The field schema for this KV entry */
	field: TField;
};

/**
 * Map of KV key names to their full definitions (metadata + field).
 *
 * This is the normalized format that flows through the entire system.
 * Created using the `kv()` factory function for each key-value entry.
 *
 * @example
 * ```typescript
 * const settingsKv: KvDefinitionMap = {
 *   theme: {
 *     name: 'Theme',
 *     icon: { type: 'emoji', value: '🎨' },
 *     description: 'Application color theme',
 *     field: select({ options: ['light', 'dark'], default: 'light' }),
 *   },
 *   fontSize: {
 *     name: 'Font Size',
 *     icon: { type: 'emoji', value: '🔤' },
 *     description: 'Editor font size in pixels',
 *     field: integer({ default: 14 }),
 *   },
 * };
 * ```
 */
export type KvDefinitionMap = Record<string, KvDefinition>;

/**
 * Map of KV keys to their field schemas (no metadata).
 *
 * This is a minimal input format for KV definitions where metadata
 * (name, icon, etc.) is auto-generated.
 *
 * @example
 * ```typescript
 * const kv: KvMap = {
 *   theme: select({ options: ['light', 'dark'] as const, default: 'light' }),
 *   fontSize: integer({ default: 14 }),
 * };
 *
 * // Use in defineWorkspace:
 * const definition = defineWorkspace({
 *   tables: { posts: table({ name: 'Posts', fields: { id: id(), title: text() } }) },
 *   kv,  // KvMap
 * });
 * ```
 */
export type KvMap = Record<string, KvField>;
