import { customAlphabet } from 'nanoid';
import type { Brand } from 'wellcrafted/brand';
import * as Y from 'yjs';
import type { YRow } from '../db/table-helper';

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
 * A datetime value that knows its timezone and can serialize itself
 * @property date - JavaScript Date object (internally stored as UTC)
 * @property timezone - IANA timezone identifier
 * @property toJSON - Method to serialize to DateWithTimezoneString format
 */
export type DateWithTimezone = {
	date: Date;
	timezone: string;
	toJSON(): DateWithTimezoneString;
};

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
		typeof value.timezone === 'string' &&
		'toJSON' in value &&
		typeof value.toJSON === 'function'
	);
}

/**
 * Creates a DateWithTimezone object from a Date and timezone.
 * The returned object includes a toJSON() method for serialization.
 *
 * @param params.date - JavaScript Date object
 * @param params.timezone - IANA timezone identifier (e.g., "America/New_York", "UTC")
 * @returns DateWithTimezone object with toJSON method
 * @example
 * ```typescript
 * const now = DateWithTimezone({ date: new Date(), timezone: 'America/New_York' });
 * console.log(now.date);       // Date object
 * console.log(now.timezone);   // "America/New_York"
 * console.log(now.toJSON());   // "2024-01-01T20:00:00.000Z|America/New_York"
 * ```
 */
export function DateWithTimezone({
	date,
	timezone,
}: {
	date: Date;
	timezone: string;
}): DateWithTimezone {
	return {
		date,
		timezone,
		toJSON() {
			return `${date.toISOString()}|${timezone}` as DateWithTimezoneString;
		},
	};
}

/**
 * Parses a DateWithTimezone object from a serialized string.
 * The returned object includes a toJSON() method for serialization.
 *
 * @param serialized - String in format "ISO_UTC|TIMEZONE"
 * @returns DateWithTimezone object with toJSON method
 * @throws Error if the serialized string is not in the correct format
 * @example
 * ```typescript
 * const parsed = DateWithTimezoneFromString("2024-01-01T20:00:00.000Z|America/New_York" as DateWithTimezoneString);
 * console.log(parsed.date);    // Date object for 2024-01-01T20:00:00.000Z
 * console.log(parsed.timezone);// "America/New_York"
 * ```
 */
export function DateWithTimezoneFromString(
	serialized: DateWithTimezoneString,
): DateWithTimezone {
	const [isoUtc, timezone] = serialized.split('|');
	if (!isoUtc || !timezone) {
		throw new Error(`Invalid DateWithTimezone format: ${serialized}`);
	}
	return DateWithTimezone({ date: new Date(isoUtc), timezone });
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
	default?: string | (() => string);
};

export type YtextColumnSchema<TNullable extends boolean = boolean> = {
	type: 'ytext';
	nullable: TNullable;
};

export type IntegerColumnSchema<TNullable extends boolean = boolean> = {
	type: 'integer';
	nullable: TNullable;
	default?: number | (() => number);
};

export type RealColumnSchema<TNullable extends boolean = boolean> = {
	type: 'real';
	nullable: TNullable;
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
 * Workspace schema - maps table names to their table schemas
 */
export type WorkspaceSchema = Record<string, TableSchema>;

/**
 * Table schema - maps column names to their schemas
 * Must always include an 'id' column with IdColumnSchema
 */
export type TableSchema = { id: IdColumnSchema } & Record<string, ColumnSchema>;

/**
 * Maps a ColumnSchema to its cell value type (Y.js types or primitives).
 * Handles nullable fields and returns Y.js types for ytext and multi-select.
 *
 * @example
 * ```typescript
 * type IdValue = ColumnSchemaToCellValue<{ type: 'id' }>; // string
 * type TextField = ColumnSchemaToCellValue<{ type: 'text'; nullable: true }>; // string | null
 * type YtextField = ColumnSchemaToCellValue<{ type: 'ytext'; nullable: false }>; // Y.Text
 * type MultiSelectField = ColumnSchemaToCellValue<{ type: 'multi-select'; nullable: false; options: readonly ['x', 'y'] }>; // Y.Array<string>
 * ```
 */
export type ColumnSchemaToCellValue<C extends ColumnSchema> =
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
									: C extends MultiSelectColumnSchema<
												infer TOptions,
												infer TNullable
											>
										? TNullable extends true
											? Y.Array<TOptions[number]> | null
											: Y.Array<TOptions[number]>
										: never;

/**
 * Discriminated union representing row validation result
 * Three possible states:
 * - valid: Data matches schema perfectly
 * - schema-mismatch: Valid Row structure but doesn't match schema
 * - invalid-structure: Not a valid Row structure
 */
export type RowValidationResult<TRow extends Row> =
	| { status: 'valid'; row: TRow }
	| { status: 'schema-mismatch'; row: Row; reason: SchemaMismatchReason }
	| {
			status: 'invalid-structure';
			row: unknown;
			reason: InvalidStructureReason;
	  };

/**
 * Reasons why structural validation failed
 */
export type InvalidStructureReason =
	| {
			type: 'not-an-object';
			actual: unknown;
	  }
	| {
			type: 'invalid-cell-value';
			field: string;
			actual: unknown;
	  };

/**
 * Reasons why schema validation failed
 */
export type SchemaMismatchReason =
	| {
			type: 'missing-required-field';
			field: string;
	  }
	| {
			type: 'type-mismatch';
			field: string;
			schemaType: ColumnSchema['type'];
			actual: unknown;
	  }
	| {
			type: 'invalid-option';
			field: string;
			actual: string;
			allowedOptions: readonly string[];
	  };

/**
 * Discriminated union representing the result of getting a row by ID
 * Four possible states:
 * - valid: Row exists and matches schema perfectly
 * - schema-mismatch: Row exists but doesn't match schema
 * - invalid-structure: Row exists but has invalid structure
 * - not-found: Row does not exist
 */
export type GetRowResult<TRow extends Row> =
	| RowValidationResult<TRow>
	| { status: 'not-found'; row: null };

/**
 * Maps a TableSchema to a row type with properly typed fields AND Proxy methods.
 * This is a Proxy-wrapped YRow that provides:
 * - Type-safe property access: `row.title`, `row.content`, etc.
 * - `.toJSON()` method: Convert to fully serialized object (Y.Text → string, Y.Array → array[], etc.)
 * - `.$yRow` property: Access underlying YRow when needed
 *
 * Each column name becomes a property with its corresponding YJS or primitive type.
 * Since `TableSchema` always requires an `id` column, every row type includes a guaranteed `id: string` property.
 *
 * @example
 * ```typescript
 * // Type-safe with specific schema
 * type PostSchema = {
 *   id: { type: 'id' };
 *   title: { type: 'text'; nullable: false };
 *   content: { type: 'ytext'; nullable: false };
 *   viewCount: { type: 'integer'; nullable: false };
 * };
 *
 * const row: Row<PostSchema> = table.get('123').row;
 *
 * // Type-safe property access (returns Y.js types)
 * console.log(row.title);         // string
 * console.log(row.content);       // Y.Text
 * console.log(row.viewCount);     // number
 *
 * // Convert to fully serialized object (Y.Text → string, etc.)
 * const serialized = row.toJSON();     // SerializedRow<PostSchema>
 * // { id: string, title: string, content: string, viewCount: number }
 *
 * // Access underlying YRow
 * const yrow = row.$yRow;         // YRow
 * ```
 */
export type Row<TTableSchema extends TableSchema = TableSchema> = {
	readonly [K in keyof TTableSchema]: ColumnSchemaToCellValue<TTableSchema[K]>;
} & {
	/**
	 * Convert the row to a fully serialized plain object.
	 * Y.Text → string, Y.Array → array[], DateWithTimezone → string, etc.
	 */
	toJSON(): SerializedRow<TTableSchema>;

	/**
	 * Validate the row against its schema.
	 * Checks for missing required fields, type mismatches, and invalid options.
	 * Returns validation result including the row for convenience.
	 */
	validate(): RowValidationResult<Row<TTableSchema>>;

	/**
	 * Access the underlying YRow for advanced YJS operations.
	 * Use this when you need direct Y.Map API access.
	 */
	readonly $yRow: YRow;
};

/**
 * Creates a Proxy-wrapped YRow that provides type-safe property access.
 * This is what implements the `Row<T>` type - a Proxy that looks like a plain object
 * but delegates to the underlying YRow.
 *
 * The Proxy intercepts property access and delegates to the YRow:
 * - `row.content` → `yrow.get('content')`
 * - `row.toJSON()` → converts YRow to fully serialized object using schema
 * - `row.$yRow` → returns the underlying YRow
 *
 * @param yrow - The YRow to wrap
 * @param schema - The table schema for proper serialization
 * @returns A Proxy that implements Row<TTableSchema> with type-safe access to the YRow
 */
export function createRow<TTableSchema extends TableSchema>({
	yrow,
	schema,
}: {
	yrow: YRow;
	schema: TTableSchema;
}): Row<TTableSchema> {
	const proxy: Row<TTableSchema> = new Proxy(
		{},
		{
			get(_target, prop) {
				if (prop === 'toJSON') {
					return () => {
						// Inline serialization: convert Y.Map to plain object, then serialize each value
						const result: Record<string, unknown> = {};

						for (const key in schema) {
							const value = yrow.get(key);
							if (value !== undefined) {
								// Serialize the value based on its type
								if (value instanceof Y.Text) {
									result[key] = value.toString();
								} else if (value instanceof Y.Array) {
									result[key] = value.toArray();
								} else if (isDateWithTimezone(value)) {
									result[key] = value.toJSON();
								} else {
									result[key] = value;
								}
							}
						}

						return result as SerializedRow<TTableSchema>;
					};
				}

				if (prop === 'validate') {
					return (): RowValidationResult<Row<TTableSchema>> => {
						// Schema validation - validate each field against schema constraints
						for (const [fieldName, columnSchema] of Object.entries(schema)) {
							const value = yrow.get(fieldName);

							// Check if required field is null/undefined
							if (value === null || value === undefined) {
								if (columnSchema.type === 'id' || !columnSchema.nullable) {
									return {
										status: 'schema-mismatch' as const,
										row: proxy as Row,
										reason: {
											type: 'missing-required-field' as const,
											field: fieldName,
										},
									};
								}
								continue;
							}

							// Type-specific validation
							switch (columnSchema.type) {
								case 'id':
								case 'text':
									if (typeof value !== 'string') {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									break;

								case 'integer':
									if (typeof value !== 'number' || !Number.isInteger(value)) {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									break;

								case 'real':
									if (typeof value !== 'number') {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									break;

								case 'boolean':
									if (typeof value !== 'boolean') {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									break;

								case 'ytext':
									if (!(value instanceof Y.Text)) {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									break;

								case 'select':
									if (typeof value !== 'string') {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									if (!columnSchema.options.includes(value)) {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'invalid-option' as const,
												field: fieldName,
												actual: value,
												allowedOptions: columnSchema.options,
											},
										};
									}
									break;

								case 'multi-select':
									if (!(value instanceof Y.Array)) {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									// Validate each option in the array
									for (const option of value.toArray()) {
										if (typeof option !== 'string') {
											return {
												status: 'schema-mismatch' as const,
												row: proxy as Row,
												reason: {
													type: 'type-mismatch' as const,
													field: fieldName,
													schemaType: columnSchema.type,
													actual: option,
												},
											};
										}
										if (!columnSchema.options.includes(option)) {
											return {
												status: 'schema-mismatch' as const,
												row: proxy as Row,
												reason: {
													type: 'invalid-option' as const,
													field: fieldName,
													actual: option,
													allowedOptions: columnSchema.options,
												},
											};
										}
									}
									break;

								case 'date':
									if (!isDateWithTimezone(value)) {
										return {
											status: 'schema-mismatch' as const,
											row: proxy as Row,
											reason: {
												type: 'type-mismatch' as const,
												field: fieldName,
												schemaType: columnSchema.type,
												actual: value,
											},
										};
									}
									break;
							}
						}

						return { status: 'valid' as const, row: proxy };
					};
				}

				if (prop === '$yRow') {
					return yrow;
				}

				// Get value from Y.Map
				if (typeof prop === 'string') {
					return yrow.get(prop);
				}

				return undefined;
			},

			has(_target, prop) {
				if (prop === 'toJSON' || prop === 'validate' || prop === '$yRow')
					return true;
				return yrow.has(prop as string);
			},

			ownKeys(_target) {
				return [...yrow.keys(), 'toJSON', 'validate', '$yRow'];
			},

			getOwnPropertyDescriptor(_target, prop) {
				if (prop === 'toJSON' || prop === 'validate' || prop === '$yRow') {
					return {
						configurable: true,
						enumerable: false,
						writable: false,
					};
				}
				if (typeof prop === 'string' && yrow.has(prop)) {
					return {
						configurable: true,
						enumerable: true,
						writable: false,
					};
				}
				return undefined;
			},
		},
	) as Row<TTableSchema>;

	return proxy;
}

/**
 * Union of all possible cell values across all column types.
 * Used for Y.Map value types in YJS documents.
 */
export type CellValue = ColumnSchemaToCellValue<TableSchema[keyof TableSchema]>;

/**
 * ISO 8601 UTC datetime string from Date.toISOString()
 * @example "2024-01-01T20:00:00.000Z"
 */
export type DateIsoString = string & Brand<'DateIsoString'>;

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
 * Converts a cell value to its serialized equivalent for storage/transport
 * - Y.Text → string
 * - Y.Array<T> → T[]
 * - DateWithTimezone → DateWithTimezoneString
 * - Other types → unchanged
 *
 * Handles nullable types automatically due to distributive conditional types:
 * - SerializedCellValue<Y.Text | null> = string | null
 * - SerializedCellValue<Y.Array<string> | null> = string[] | null
 */
export type SerializedCellValue<T extends CellValue = CellValue> =
	T extends Y.Text
		? string
		: T extends Y.Text | null
			? string | null
			: T extends Y.Array<infer U>
				? U[]
				: T extends Y.Array<infer U> | null
					? U[] | null
					: T extends DateWithTimezone
						? DateWithTimezoneString
						: T extends DateWithTimezone | null
							? DateWithTimezoneString | null
							: T;

/**
 * Serialized row - all cell values converted to plain JavaScript types.
 * This type is useful for:
 * - Storing data in formats that don't support YJS types (SQLite, markdown, JSON APIs)
 * - Passing data across boundaries where YJS types aren't available
 * - Input validation before converting to YJS types
 *
 * @example
 * ```typescript
 * type PostSchema = {
 *   id: { type: 'id' };
 *   title: { type: 'ytext'; nullable: false };
 *   tags: { type: 'multi-select'; options: ['a', 'b']; nullable: false };
 *   publishedAt: { type: 'date'; nullable: false };
 * };
 *
 * type SerializedPost = SerializedRow<PostSchema>;
 * // { id: string; title: string; tags: string[]; publishedAt: DateWithTimezoneString }
 * ```
 */
export type SerializedRow<TTableSchema extends TableSchema = TableSchema> = {
	[K in keyof TTableSchema]: SerializedCellValue<
		ColumnSchemaToCellValue<TTableSchema[K]>
	>;
};

/**
 * Serializes a single cell value to its plain JavaScript equivalent.
 * - Y.Text → string
 * - Y.Array<T> → T[]
 * - DateWithTimezone → DateWithTimezoneString ("ISO_UTC|TIMEZONE" format)
 * - Other types → unchanged (primitives, null, undefined)
 *
 * @example
 * ```typescript
 * const ytext = new Y.Text();
 * ytext.insert(0, 'Hello');
 * serializeCellValue(ytext); // 'Hello'
 *
 * const yarray = Y.Array.from(['a', 'b', 'c']);
 * serializeCellValue(yarray); // ['a', 'b', 'c']
 *
 * const date = { date: new Date('2024-01-01'), timezone: 'America/New_York' };
 * serializeCellValue(date); // '2024-01-01T00:00:00.000Z|America/New_York'
 *
 * serializeCellValue(null); // null
 * serializeCellValue(42); // 42
 * serializeCellValue('text'); // 'text'
 * ```
 */
export function serializeCellValue<T extends CellValue>(
	value: T,
): SerializedCellValue<T> {
	if (value instanceof Y.Text) {
		return value.toString() as SerializedCellValue<T>;
	}
	if (value instanceof Y.Array) {
		return value.toArray() as SerializedCellValue<T>;
	}
	if (isDateWithTimezone(value)) {
		return value.toJSON() as SerializedCellValue<T>;
	}
	return value as SerializedCellValue<T>;
}

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
 * text({ default: 'unnamed' })
 */
export function text(opts: {
	nullable: true;
	default?: string | (() => string);
}): TextColumnSchema<true>;
export function text(opts?: {
	nullable?: false;
	default?: string | (() => string);
}): TextColumnSchema<false>;
export function text({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: string | (() => string);
} = {}): TextColumnSchema<boolean> {
	return {
		type: 'text',
		nullable,
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
 * Creates an integer column schema (NOT NULL by default)
 * @example
 * integer() // → { type: 'integer', nullable: false }
 * integer({ default: 0 })
 */
export function integer(opts: {
	nullable: true;
	default?: number | (() => number);
}): IntegerColumnSchema<true>;
export function integer(opts?: {
	nullable?: false;
	default?: number | (() => number);
}): IntegerColumnSchema<false>;
export function integer({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: number | (() => number);
} = {}): IntegerColumnSchema<boolean> {
	return {
		type: 'integer',
		nullable,
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
	default?: number | (() => number);
}): RealColumnSchema<true>;
export function real(opts?: {
	nullable?: false;
	default?: number | (() => number);
}): RealColumnSchema<false>;
export function real({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: number | (() => number);
} = {}): RealColumnSchema<boolean> {
	return {
		type: 'real',
		nullable,
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
 * date({ default: () => DateWithTimezone({ date: new Date(), timezone: 'UTC' }) })
 */
export function date(opts: {
	nullable: true;
	default?: DateWithTimezone | (() => DateWithTimezone);
}): DateColumnSchema<true>;
export function date(opts?: {
	nullable?: false;
	default?: DateWithTimezone | (() => DateWithTimezone);
}): DateColumnSchema<false>;
export function date({
	nullable = false,
	default: defaultValue,
}: {
	nullable?: boolean;
	default?: DateWithTimezone | (() => DateWithTimezone);
} = {}): DateColumnSchema<boolean> {
	return {
		type: 'date',
		nullable,
		default: defaultValue,
	};
}

/**
 * Creates a select (single choice) column schema
 * @example
 * select({ options: ['draft', 'published', 'archived'] })
 * select({ options: ['tech', 'personal'], default: 'tech' })
 */
export function select<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable: true;
	default?: TOptions[number];
}): SelectColumnSchema<TOptions, true>;
export function select<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
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
export function multiSelect<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable: true;
	default?: TOptions[number][];
}): MultiSelectColumnSchema<TOptions, true>;
export function multiSelect<
	const TOptions extends readonly [string, ...string[]],
>(opts: {
	options: TOptions;
	nullable?: false;
	default?: TOptions[number][];
}): MultiSelectColumnSchema<TOptions, false>;
export function multiSelect<
	const TOptions extends readonly [string, ...string[]],
>({
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
