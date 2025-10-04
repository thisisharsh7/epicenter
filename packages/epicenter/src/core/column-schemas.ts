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
 * ISO 8601 UTC datetime string from Date.toISOString()
 * @example "2024-01-01T20:00:00.000Z"
 */
export type DateIsoString = string & Brand<'UtcIsoString'>;

/**
 * IANA timezone identifier
 * @example "America/New_York"
 * @example "Europe/London"
 * @example "Asia/Tokyo"
 * @example "UTC"
 */
export type TimezoneId = string & Brand<'TimezoneId'>;

/**
 * Database storage format combining UTC datetime and timezone
 * @example "2024-01-01T20:00:00.000Z|America/New_York"
 */
export type DateWithTimezoneString = `${DateIsoString}|${TimezoneId}` &
	Brand<'DateWithTimezoneString'>;

/**
 * A datetime value that knows its timezone
 * @property date - JavaScript Date object (internally stored as UTC)
 * @property timezone - IANA timezone identifier
 */
export type DateWithTimezone = { date: Date; timezone: string };

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

export type TextColumnSchema = {
	type: 'text';
	nullable: boolean;
	unique?: boolean;
	default?: string | (() => string);
};

export type YtextColumnSchema = { type: 'ytext'; nullable: boolean };

export type YxmlfragmentColumnSchema = {
	type: 'yxmlfragment';
	nullable: boolean;
};

export type IntegerColumnSchema = {
	type: 'integer';
	nullable: boolean;
	unique?: boolean;
	default?: number | (() => number);
};

export type RealColumnSchema = {
	type: 'real';
	nullable: boolean;
	unique?: boolean;
	default?: number | (() => number);
};

export type BooleanColumnSchema = {
	type: 'boolean';
	nullable: boolean;
	default?: boolean | (() => boolean);
};

export type DateColumnSchema = {
	type: 'date';
	nullable: boolean;
	unique?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
};

export type SelectColumnSchema = {
	type: 'select';
	nullable: boolean;
	options: readonly string[];
	default?: string;
};

export type MultiSelectColumnSchema = {
	type: 'multi-select';
	nullable: boolean;
	options: readonly string[];
	default?: string[];
};

/**
 * Extract just the type names from ColumnSchema
 */
export type ColumnType = ColumnSchema['type'];

/**
 * Table schema - maps column names to their schemas
 */
export type TableSchema = Record<string, ColumnSchema>;

/**
 * Maps a ColumnSchema to its YJS or primitive TypeScript type.
 * Handles nullable fields and returns YJS types for ytext, yxmlfragment, and multi-select.
 *
 * @example
 * ```typescript
 * type IdType = ColumnToType<{ type: 'id'; nullable: false }>; // string
 * type TextField = ColumnToType<{ type: 'text'; nullable: true }>; // string | null
 * type YtextField = ColumnToType<{ type: 'ytext'; nullable: false }>; // Y.Text
 * type YxmlField = ColumnToType<{ type: 'yxmlfragment'; nullable: false }>; // Y.XmlFragment
 * type MultiSelectField = ColumnToType<{ type: 'multi-select'; nullable: false; options: readonly ['x', 'y'] }>; // Y.Array<string>
 * ```
 */
export type ColumnToType<C extends ColumnSchema> = C extends { type: 'id' }
	? string
	: C extends { type: 'text' }
		? C extends { nullable: true }
			? string | null
			: string
		: C extends { type: 'ytext' }
			? C extends { nullable: true }
				? Y.Text | null
				: Y.Text
			: C extends { type: 'yxmlfragment' }
				? C extends { nullable: true }
					? Y.XmlFragment | null
					: Y.XmlFragment
				: C extends { type: 'integer' }
					? C extends { nullable: true }
						? number | null
						: number
					: C extends { type: 'real' }
						? C extends { nullable: true }
							? number | null
							: number
						: C extends { type: 'boolean' }
							? C extends { nullable: true }
								? boolean | null
								: boolean
							: C extends { type: 'date' }
								? C extends { nullable: true }
									? DateWithTimezone | null
									: DateWithTimezone
								: C extends { type: 'select' }
									? C extends { nullable: true }
										? string | null
										: string
									: C extends { type: 'multi-select' }
										? Y.Array<string>
										: never;

/**
 * Maps a TableSchema to a row type with properly typed fields.
 * Each column name becomes a property with its corresponding YJS or primitive type.
 *
 * When no generic is provided, defaults to the equivalent of `Record<string, CellValue>`.
 *
 * @example
 * ```typescript
 * type PostSchema = {
 *   id: { type: 'id'; nullable: false };
 *   title: { type: 'text'; nullable: false };
 *   content: { type: 'yxmlfragment'; nullable: true };
 *   viewCount: { type: 'integer'; nullable: false };
 * };
 * type PostRow = Row<PostSchema>; // { id: string; title: string; content: Y.XmlFragment | null; viewCount: number }
 *
 * type GenericRow = Row; // Record<string, CellValue>
 * ```
 */
export type Row<TTableSchema extends TableSchema = TableSchema> = {
	[K in keyof TTableSchema]: ColumnToType<TTableSchema[K]>;
};

/**
 * Union of all possible cell values across all column types.
 * Derived from ColumnToType to ensure consistency.
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
export function text(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: string | (() => string);
}): TextColumnSchema {
	return {
		type: 'text',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
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
export function ytext(opts?: {
	nullable?: boolean;
}): YtextColumnSchema {
	return {
		type: 'ytext',
		nullable: opts?.nullable ?? false,
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
export function yxmlfragment(opts?: {
	nullable?: boolean;
}): YxmlfragmentColumnSchema {
	return {
		type: 'yxmlfragment',
		nullable: opts?.nullable ?? false,
	};
}

/**
 * Creates an integer column schema (NOT NULL by default)
 * @example
 * integer() // → { type: 'integer', nullable: false }
 * integer({ default: 0 })
 */
export function integer(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
}): IntegerColumnSchema {
	return {
		type: 'integer',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
	};
}

/**
 * Creates a real/float column schema (NOT NULL by default)
 * @example
 * real() // → { type: 'real', nullable: false }
 * real({ default: 0.0 })
 */
export function real(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: number | (() => number);
}): RealColumnSchema {
	return {
		type: 'real',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
	};
}

/**
 * Creates a boolean column schema (NOT NULL by default)
 * @example
 * boolean() // → { type: 'boolean', nullable: false }
 * boolean({ default: false })
 */
export function boolean(opts?: {
	nullable?: boolean;
	default?: boolean | (() => boolean);
}): BooleanColumnSchema {
	return {
		type: 'boolean',
		nullable: opts?.nullable ?? false,
		default: opts?.default,
	};
}

/**
 * Creates a date with timezone column schema (NOT NULL by default)
 * @example
 * date() // → { type: 'date', nullable: false }
 * date({ nullable: true })
 * date({ default: () => ({ date: new Date(), timezone: 'UTC' }) })
 */
export function date(opts?: {
	nullable?: boolean;
	unique?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
}): DateColumnSchema {
	return {
		type: 'date',
		nullable: opts?.nullable ?? false,
		unique: opts?.unique,
		default: opts?.default,
	};
}

/**
 * Creates a select (single choice) column schema
 * @example
 * select({ options: ['draft', 'published', 'archived'] as const })
 * select({ options: ['tech', 'personal'], default: 'tech' })
 */
export function select(opts: {
	options: readonly string[];
	nullable?: boolean;
	default?: string;
}): SelectColumnSchema {
	return {
		type: 'select',
		nullable: opts.nullable ?? false,
		options: opts.options,
		default: opts.default,
	};
}

/**
 * Creates a multi-select (multiple choice) column schema
 * @example
 * multiSelect({ options: ['typescript', 'javascript', 'python'] as const })
 * multiSelect({ options: ['tag1', 'tag2'], default: [] })
 */
export function multiSelect(opts: {
	options: readonly string[];
	nullable?: boolean;
	default?: string[];
}): MultiSelectColumnSchema {
	return {
		type: 'multi-select',
		nullable: opts.nullable ?? false,
		options: opts.options,
		default: opts.default,
	};
}
