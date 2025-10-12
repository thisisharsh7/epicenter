import { customAlphabet } from 'nanoid';
import type { Brand } from 'wellcrafted/brand';
import * as Y from 'yjs';

/**
 * Column schema definitions as pure JSON objects.
 * These schemas are serializable and can be used to generate
 * different storage backends (SQLite, markdown, etc.)
 */

/**
 * ID type - branded string from nanoid
 */
export type Id = string & Brand<'Id'>;

/**
 * A datetime value that knows its timezone
 * @property date - JavaScript Date object (internally stored as UTC)
 * @property timezone - IANA timezone identifier
 */
export type DateWithTimezone = { date: Date; timezone: string };

/**
 * Type guard to check if a value is a valid DateWithTimezone
 */
export function isDateWithTimezone(value: unknown): value is DateWithTimezone {
	return (
		typeof value === 'object' &&
		value !== null &&
		'date' in value &&
		value.date instanceof Date &&
		'timezone' in value &&
		typeof value.timezone === 'string'
	);
}

/**
 * Generates a nano ID - 21 character alphanumeric string
 */
export function generateId(): Id {
	const nanoid = customAlphabet(
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
		21,
	);
	return nanoid() as Id;
}

/**
 * Discriminated union of all column types
 */
export type ColumnSchema =
	| IdColumnSchema
	| TextColumnSchema
	| YtextColumnSchema
	| YxmlfragmentColumnSchema
	| IntegerColumnSchema
	| RealColumnSchema
	| BooleanColumnSchema
	| DateColumnSchema
	| SelectColumnSchema
	| MultiSelectColumnSchema;

/**
 * Individual column schema types
 */
export type IdColumnSchema = { type: 'id' };

export type TextColumnSchema<TNullable extends boolean = boolean> = {
	type: 'text';
	nullable: TNullable;
	unique?: boolean;
	default?: string | (() => string);
};

export type YtextColumnSchema<TNullable extends boolean = boolean> = {
	type: 'ytext';
	nullable: TNullable;
};

export type YxmlfragmentColumnSchema<TNullable extends boolean = boolean> = {
	type: 'yxmlfragment';
	nullable: TNullable;
};

export type IntegerColumnSchema<TNullable extends boolean = boolean> = {
	type: 'integer';
	nullable: TNullable;
	unique?: boolean;
	default?: number | (() => number);
};

export type RealColumnSchema<TNullable extends boolean = boolean> = {
	type: 'real';
	nullable: TNullable;
	unique?: boolean;
	default?: number | (() => number);
};

export type BooleanColumnSchema<TNullable extends boolean = boolean> = {
	type: 'boolean';
	nullable: TNullable;
	default?: boolean | (() => boolean);
};

export type DateColumnSchema<TNullable extends boolean = boolean> = {
	type: 'date';
	nullable: TNullable;
	unique?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
};

export type SelectColumnSchema<
	TOptions extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
	TNullable extends boolean = boolean,
> = {
	type: 'select';
	nullable: TNullable;
	options: TOptions;
	default?: TOptions[number];
};

export type MultiSelectColumnSchema<
	TOptions extends readonly [string, ...string[]] = readonly [
		string,
		...string[],
	],
	TNullable extends boolean = boolean,
> = {
	type: 'multi-select';
	nullable: TNullable;
	options: TOptions;
	default?: TOptions[number][];
};

/**
 * Extract just the type names from ColumnSchema
 */
export type ColumnType = ColumnSchema['type'];

/**
 * Database schema - maps table names to their table schemas
 */
export type Schema = Record<string, TableSchema>;

/**
 * Table schema - maps column names to their schemas
 * Must always include an 'id' column with IdColumnSchema
 */
export type TableSchema = { id: IdColumnSchema } & Record<string, ColumnSchema>;

/**
 * Maps a ColumnSchema to its YJS or primitive TypeScript type.
 * Handles nullable fields and returns YJS types for ytext, yxmlfragment, and multi-select.
 *
 * @example
 * ```typescript
 * type IdType = ColumnSchemaToType<{ type: 'id' }>; // string
 * type TextField = ColumnSchemaToType<{ type: 'text'; nullable: true }>; // string | null
 * type YtextField = ColumnSchemaToType<{ type: 'ytext'; nullable: false }>; // Y.Text
 * type YxmlField = ColumnSchemaToType<{ type: 'yxmlfragment'; nullable: false }>; // Y.XmlFragment
 * type MultiSelectField = ColumnSchemaToType<{ type: 'multi-select'; nullable: false; options: readonly ['x', 'y'] }>; // Y.Array<string>
 * ```
 */
export type ColumnSchemaToType<C extends ColumnSchema> =
	C extends IdColumnSchema
		? string
		: C extends TextColumnSchema<infer TNullable>
			? TNullable extends true
				? string | null
				: string
			: C extends YtextColumnSchema<infer TNullable>
				? TNullable extends true
					? Y.Text | null
					: Y.Text
				: C extends YxmlfragmentColumnSchema<infer TNullable>
					? TNullable extends true
						? Y.XmlFragment | null
						: Y.XmlFragment
					: C extends IntegerColumnSchema<infer TNullable>
						? TNullable extends true
							? number | null
							: number
						: C extends RealColumnSchema<infer TNullable>
							? TNullable extends true
								? number | null
								: number
							: C extends BooleanColumnSchema<infer TNullable>
								? TNullable extends true
									? boolean | null
									: boolean
								: C extends DateColumnSchema<infer TNullable>
									? TNullable extends true
										? DateWithTimezone | null
										: DateWithTimezone
									: C extends SelectColumnSchema<infer TOptions, infer TNullable>
										? TNullable extends true
											? TOptions[number] | null
											: TOptions[number]
										: C extends MultiSelectColumnSchema<infer TOptions, infer TNullable>
											? TNullable extends true
												? Y.Array<TOptions[number]> | null
												: Y.Array<TOptions[number]>
											: never;

/**
 * Maps a specific TableSchema to a validated row type with properly typed fields.
 * Each column name becomes a property with its corresponding YJS or primitive type.
 *
 * Since `TableSchema` always requires an `id` column, every row type includes a guaranteed `id: string` property.
 *
 * @example
 * ```typescript
 * type PostSchema = {
 *   id: { type: 'id' };
 *   title: { type: 'text'; nullable: false };
 *   content: { type: 'yxmlfragment'; nullable: true };
 *   viewCount: { type: 'integer'; nullable: false };
 * };
 * type PostRow = ValidatedRow<PostSchema>; // { id: string; title: string; content: Y.XmlFragment | null; viewCount: number }
 * ```
 */
export type ValidatedRow<TTableSchema extends TableSchema> = {
	[K in keyof TTableSchema]: ColumnSchemaToType<TTableSchema[K]>;
};

/**
 * A row type that works with any TableSchema (untyped, dynamic).
 * Useful for internal implementations that need to handle rows generically without knowing the specific schema at compile time.
 *
 * In most application code, prefer using ValidatedRow<TTableSchema> for type-safe, schema-specific rows.
 *
 * @example
 * ```typescript
 * // Internal utility that works with any row
 * function logRow(row: Row) {
 *   console.log(row.id); // guaranteed to exist
 *   console.log(row); // { id: string; [x: string]: CellValue }
 * }
 * ```
 */
export type Row = ValidatedRow<TableSchema>;

/**
 * Union of all possible cell values across all column types.
 * Derived from ColumnSchemaToType to ensure consistency.
 * Used for Y.Map value types in YJS documents.
 */
export type CellValue = Row[keyof Row];

/**
 * Creates an ID column schema - always primary key with auto-generation
 * IDs are always NOT NULL (cannot be nullable)
 * @example
 * id() // → { type: 'id' }
 */
export function id(): IdColumnSchema {
	return { type: 'id' };
}

/**
 * Creates a text column schema (NOT NULL by default)
 * @example
 * text() // → { type: 'text', nullable: false }
 * text({ nullable: true }) // → { type: 'text', nullable: true }
 * text({ unique: true, default: 'unnamed' })
 */
export function text(opts: {
	nullable: true;
	unique?: boolean;
	default?: string | (() => string);
}): TextColumnSchema<true>;
export function text(opts?: {
	nullable?: false;
	unique?: boolean;
	default?: string | (() => string);
}): TextColumnSchema<false>;
export function text({
	nullable = false,
	unique,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: string | (() => string);
} = {}): TextColumnSchema<boolean> {
	return {
		type: 'text',
		nullable,
		unique,
		default: defaultValue,
	};
}

/**
 * Collaborative text editor column - stored as Y.Text (YJS shared type)
 *
 * Y.Text is a flat/linear text structure that supports inline formatting.
 * **Primary use case: Code editors** (Monaco, CodeMirror) with syntax highlighting.
 * Also works for: simple rich text (Quill), formatted comments, chat messages.
 *
 * **What Y.Text supports:**
 * - Inline formatting: bold, italic, underline, links, colors
 * - No block-level structure (no paragraphs, lists, or tables)
 *
 * **Most common editor bindings:**
 * - CodeMirror (code editing) - PRIMARY USE CASE
 * - Monaco Editor (code editing) - PRIMARY USE CASE
 * - Quill (simple WYSIWYG with inline formatting)
 *
 * **Common use cases:**
 * - SQL/JavaScript/Python code editors with syntax highlighting
 * - Code snippets in documentation
 * - Formatted comments or chat messages
 *
 * @example
 * query: ytext() // → Y.Text binded to CodeMirror/Monaco for storing SQL queries
 * snippet: ytext() // → Y.Text binded to CodeMirror for code examples
 * comment: ytext({ nullable: true }) // → Y.Text binded to Quill editor for comments
 */
export function ytext(opts: { nullable: true }): YtextColumnSchema<true>;
export function ytext(opts?: { nullable?: false }): YtextColumnSchema<false>;
export function ytext({
	nullable = false,
}: {
	nullable?: boolean;
} = {}): YtextColumnSchema<boolean> {
	return {
		type: 'ytext',
		nullable,
	};
}

/**
 * Collaborative rich document column - stored as Y.XmlFragment (YJS shared type)
 *
 * Y.XmlFragment is a tree-structured format that supports full block-level formatting.
 * **Primary use case: Rich document editing** with TipTap (ProseMirror-based).
 *
 * **What Y.XmlFragment supports:**
 * - All inline formatting (bold, italic, links, etc.)
 * - Block-level structure: paragraphs, headings (h1-h6), lists
 * - Tables, blockquotes, code blocks, images, embeds
 * - Nested structure (lists within lists, etc.)
 *
 * **Most common editor bindings:**
 * - **TipTap** (ProseMirror-based) - PRIMARY, RECOMMENDED
 * - ProseMirror (lower-level alternative)
 *
 * **Common use cases:**
 * - Article/blog content with full formatting
 * - Documentation with headings and lists
 * - Long-form content editing (like Notion pages)
 * - CMS page content
 *
 * **Important:** You must provide Y.XmlFragment instances when setting values.
 * The Y.XmlFragment instance must be created from the same Y.Doc as your table.
 *
 * @example
 * // Article content (most common)
 * content: yxmlfragment() // → TipTap for full document editing
 *
 * @example
 * // Optional description field
 * description: yxmlfragment({ nullable: true }) // → Can be null or Y.XmlFragment
 *
 * @example
 * // Setting a value
 * const fragment = new Y.XmlFragment()
 * doc.tables.posts.set({
 *   id: '1',
 *   content: fragment // Must provide Y.XmlFragment instance
 * })
 */
export function yxmlfragment(opts: { nullable: true }): YxmlfragmentColumnSchema<true>;
export function yxmlfragment(opts?: { nullable?: false }): YxmlfragmentColumnSchema<false>;
export function yxmlfragment({
	nullable = false,
}: {
	nullable?: boolean;
} = {}): YxmlfragmentColumnSchema<boolean> {
	return {
		type: 'yxmlfragment',
		nullable,
	};
}

/**
 * Creates an integer column schema (NOT NULL by default)
 * @example
 * integer() // → { type: 'integer', nullable: false }
 * integer({ default: 0 })
 */
export function integer(opts: {
	nullable: true;
	unique?: boolean;
	default?: number | (() => number);
}): IntegerColumnSchema<true>;
export function integer(opts?: {
	nullable?: false;
	unique?: boolean;
	default?: number | (() => number);
}): IntegerColumnSchema<false>;
export function integer({
	nullable = false,
	unique,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
} = {}): IntegerColumnSchema<boolean> {
	return {
		type: 'integer',
		nullable,
		unique,
		default: defaultValue,
	};
}

/**
 * Creates a real/float column schema (NOT NULL by default)
 * @example
 * real() // → { type: 'real', nullable: false }
 * real({ default: 0.0 })
 */
export function real(opts: {
	nullable: true;
	unique?: boolean;
	default?: number | (() => number);
}): RealColumnSchema<true>;
export function real(opts?: {
	nullable?: false;
	unique?: boolean;
	default?: number | (() => number);
}): RealColumnSchema<false>;
export function real({
	nullable = false,
	unique,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
} = {}): RealColumnSchema<boolean> {
	return {
		type: 'real',
		nullable,
		unique,
		default: defaultValue,
	};
}

/**
 * Creates a boolean column schema (NOT NULL by default)
 * @example
 * boolean() // → { type: 'boolean', nullable: false }
 * boolean({ default: false })
 */
export function boolean(opts: {
	nullable: true;
	default?: boolean | (() => boolean);
}): BooleanColumnSchema<true>;
export function boolean(opts?: {
	nullable?: false;
	default?: boolean | (() => boolean);
}): BooleanColumnSchema<false>;
export function boolean({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: boolean | (() => boolean);
} = {}): BooleanColumnSchema<boolean> {
	return {
		type: 'boolean',
		nullable,
		default: defaultValue,
	};
}

/**
 * Creates a date with timezone column schema (NOT NULL by default)
 * @example
 * date() // → { type: 'date', nullable: false }
 * date({ nullable: true })
 * date({ default: () => ({ date: new Date(), timezone: 'UTC' }) })
 */
export function date(opts: {
	nullable: true;
	unique?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
}): DateColumnSchema<true>;
export function date(opts?: {
	nullable?: false;
	unique?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
}): DateColumnSchema<false>;
export function date({
	nullable = false,
	unique,
	default: defaultValue,
}: {
	nullable?: boolean;
	unique?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
} = {}): DateColumnSchema<boolean> {
	return {
		type: 'date',
		nullable,
		unique,
		default: defaultValue,
	};
}

/**
 * Creates a select (single choice) column schema
 * @example
 * select({ options: ['draft', 'published', 'archived'] })
 * select({ options: ['tech', 'personal'], default: 'tech' })
 */
export function select<const TOptions extends readonly [string, ...string[]]>(opts: {
	options: TOptions;
	nullable: true;
	default?: TOptions[number];
}): SelectColumnSchema<TOptions, true>;
export function select<const TOptions extends readonly [string, ...string[]]>(opts: {
	options: TOptions;
	nullable?: false;
	default?: TOptions[number];
}): SelectColumnSchema<TOptions, false>;
export function select<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
}: {
	options: TOptions;
	nullable?: boolean;
	default?: TOptions[number];
}): SelectColumnSchema<TOptions, boolean> {
	return {
		type: 'select',
		nullable,
		options,
		default: defaultValue,
	};
}

/**
 * Creates a multi-select (multiple choice) column schema
 * @example
 * multiSelect({ options: ['typescript', 'javascript', 'python'] })
 * multiSelect({ options: ['tag1', 'tag2'], default: [] })
 */
export function multiSelect<const TOptions extends readonly [string, ...string[]]>(opts: {
	options: TOptions;
	nullable: true;
	default?: TOptions[number][];
}): MultiSelectColumnSchema<TOptions, true>;
export function multiSelect<const TOptions extends readonly [string, ...string[]]>(opts: {
	options: TOptions;
	nullable?: false;
	default?: TOptions[number][];
}): MultiSelectColumnSchema<TOptions, false>;
export function multiSelect<const TOptions extends readonly [string, ...string[]]>({
	options,
	nullable = false,
	default: defaultValue,
}: {
	options: TOptions;
	nullable?: boolean;
	default?: TOptions[number][];
}): MultiSelectColumnSchema<TOptions, boolean> {
	return {
		type: 'multi-select',
		nullable,
		options,
		default: defaultValue,
	};
}
