/**
 * @fileoverview Schema definitions and type system for collaborative database operations.
 *
 * # Three-Layer Type System
 *
 * Collaborative data flows through three representations:
 *
 * 1. **SerializedRow**: Plain JS (strings, arrays, primitives)
 *    - Why: JSON storage, markdown files, API boundaries
 *
 * 2. **YRow**: CRDTs (Y.Map, Y.Text, Y.Array)
 *    - Why: Collaborative editing, real-time sync
 *
 * 3. **Row**: Proxy-wrapped YRow
 *    - Why: Type-safe access, automatic validation, ergonomic API
 *
 * # Lifecycle: Input to Output
 *
 * ```
 * SerializedRow (user input)
 *   ↓ syncSerializedRowToYRow()
 * YRow (CRDT storage)
 *   ↓ createRow() validates
 * RowValidationResult
 *   ├─ valid: Row<TTableSchema> (typed to your schema)
 *   ├─ schema-mismatch: Row<TableSchema> (generic Row, still has .toJSON())
 *   └─ invalid-structure: unknown (no .toJSON())
 * ```
 *
 * Each serialized type maps one-to-one to a CRDT type (string → Y.Text for ytext, array → Y.Array).
 * createRow() validates immediately and returns a discriminated union.
 *
 * **Why both 'valid' and 'schema-mismatch' support .toJSON()**: They're both Row types, just with
 * different generic parameters. 'valid' gives you Row<TTableSchema> (typed to your schema), while
 * 'schema-mismatch' gives you Row (generic default <TableSchema>). Both are Rows, so both have .toJSON().
 */
import { customAlphabet } from 'nanoid';
import type { Brand } from 'wellcrafted/brand';
import * as Y from 'yjs';
import type { YRow } from '../db/table-helper';
import { updateYRowFromSerializedRow } from '../utils/yjs';

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
 * Type guard to check if a string is a valid DateWithTimezoneString.
 * Validates format: "ISO_UTC|TIMEZONE" where ISO string is exactly 24 chars.
 *
 * ISO 8601 UTC format from Date.toISOString() is always 24 characters:
 * "YYYY-MM-DDTHH:mm:ss.sssZ" (e.g., "2024-01-01T20:00:00.000Z")
 *
 * This is a fast structural check - it doesn't validate that the ISO date is valid
 * or that the timezone is a real IANA identifier, just that the format is correct.
 *
 * @param value - Value to check
 * @returns true if value is a valid DateWithTimezoneString format
 *
 * @example
 * ```typescript
 * isDateWithTimezoneString("2024-01-01T20:00:00.000Z|America/New_York") // true
 * isDateWithTimezoneString("2024-01-01T20:00:00.000Z|") // false (empty timezone)
 * isDateWithTimezoneString("2024-01-01") // false (no pipe separator)
 * ```
 */
export function isDateWithTimezoneString(
	value: unknown,
): value is DateWithTimezoneString {
	if (typeof value !== 'string') return false;

	// ISO 8601 UTC string is always 24 chars with 'Z' at position 23, pipe at 24
	// Format: "YYYY-MM-DDTHH:mm:ss.sssZ|timezone"
	return value.length > 25 && value[23] === 'Z' && value[24] === '|';
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
	if (!isDateWithTimezoneString(serialized)) {
		throw new Error(`Invalid DateWithTimezone format: ${serialized}`);
	}

	// ISO string is always first 24 characters, pipe at index 24, timezone after
	const isoUtc = serialized.slice(0, 24);
	const timezone = serialized.slice(25);

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
 * Table schema - maps column names to their schemas.
 * This is the pure schema definition that describes the structure of a table.
 * Must always include an 'id' column with IdColumnSchema.
 */
export type TableSchema = { id: IdColumnSchema } & Record<string, ColumnSchema>;

/**
 * Refined validation result that only includes 'valid' and 'schema-mismatch' statuses.
 * Used by validateYRow which cannot return 'invalid-structure'.
 */
export type YRowValidationResult<TRow extends Row> = Extract<
	RowValidationResult<TRow>,
	{ status: 'valid' } | { status: 'schema-mismatch' }
>;

/**
 * Refined SerializedRow validation result that only includes 'valid' and 'schema-mismatch'.
 * Used by validateSerializedRow which cannot return 'invalid-structure'.
 *
 * On 'valid', returns SerializedRow<TSchema> (typed to the schema).
 * On 'schema-mismatch', returns SerializedRow (generic, untyped).
 */
export type ValidatedSerializedRowResult<TSchema extends TableSchema = TableSchema> =
	| { status: 'valid'; row: SerializedRow<TSchema> }
	| { status: 'schema-mismatch'; row: SerializedRow; reason: SchemaMismatchReason };

/**
 * Validation result for SerializedRow.
 * Returns the validated SerializedRow (not Row proxy) on success.
 *
 * Extends ValidatedSerializedRowResult by adding the 'invalid-structure' case.
 */
export type SerializedRowValidationResult<TSchema extends TableSchema = TableSchema> =
	| ValidatedSerializedRowResult<TSchema>
	| {
			status: 'invalid-structure';
			row: unknown;
			reason: InvalidStructureReason;
	  };

/**
 * Table schema with validation methods.
 * Created by `createTableSchemaWithValidation()` from a `TableSchema`.
 * This is the schema definition with three validation methods added.
 *
 * @example
 * ```typescript
 * const schema = createTableSchemaWithValidation({
 *   id: id(),
 *   title: text(),
 *   content: ytext(),
 * });
 *
 * // Access schema fields directly
 * schema.title.type // 'text'
 *
 * // Validate from unknown record (validates structure + schema)
 * const result = schema.validateRecord({ id: '123', title: 'Hello', content: 'World' });
 *
 * // Validate from typed SerializedRow (validates schema only)
 * const serialized: SerializedRow<typeof schema> = { id: '123', title: 'Hello', content: 'World' };
 * const result2 = schema.validateSerializedRow(serialized);
 *
 * // Validate from YRow (validates schema only)
 * const result3 = schema.validateYRow(yrow);
 * ```
 */
export type TableSchemaWithValidation<TSchema extends TableSchema = TableSchema> = TSchema & {
	/** Validates an unknown record (checks structure + schema), returns validated SerializedRow */
	validateRecord(data: Record<string, unknown>): SerializedRowValidationResult<TSchema>;

	/** Validates a SerializedRow (checks schema only), returns validated SerializedRow<TSchema> */
	validateSerializedRow(data: SerializedRow): ValidatedSerializedRowResult<TSchema>;

	/** Validates a YRow (checks schema only), returns typed Row proxy */
	validateYRow(yrow: YRow): YRowValidationResult<Row<TSchema>>;
};

/**
 * Workspace schema - maps table names to their table schemas
 */
export type WorkspaceSchema = Record<string, TableSchema>;

/**
 * Maps a ColumnSchema to its cell value type (Y.js types or primitives).
 * Handles nullable fields and returns Y.js types for ytext and multi-select.
 *
 * @example
 * ```typescript
 * type IdValue = CellValue<{ type: 'id' }>; // string
 * type TextField = CellValue<{ type: 'text'; nullable: true }>; // string | null
 * type YtextField = CellValue<{ type: 'ytext'; nullable: false }>; // Y.Text
 * type MultiSelectField = CellValue<{ type: 'multi-select'; nullable: false; options: readonly ['x', 'y'] }>; // Y.Array<string>
 * type AnyCellValue = CellValue; // Union of all possible cell values
 * ```
 */
export type CellValue<C extends ColumnSchema = ColumnSchema> =
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
	readonly [K in keyof TTableSchema]: CellValue<TTableSchema[K]>;
} & {
	/**
	 * Convert the row to a fully serialized plain object.
	 * Y.Text → string, Y.Array → array[], DateWithTimezone → string, etc.
	 */
	toJSON(): SerializedRow<TTableSchema>;

	/**
	 * Access the underlying YRow for advanced YJS operations.
	 * Use this when you need direct Y.Map API access.
	 */
	readonly $yRow: YRow;
};

/**
 * Validates a plain object against a table schema without creating a Row proxy.
 *
 * This function performs schema validation on a plain JavaScript object (e.g., deserialized from JSON or markdown).
 * It checks that all required fields are present, types match, and select options are valid.
 *
 * @param data - Plain object to validate (e.g., from JSON.parse or markdown frontmatter)
 * @param schema - Table schema to validate against
 * @returns Validation result with status 'valid' or 'schema-mismatch' with detailed reason
 *
 * @example
 * ```typescript
 * const data = { id: '123', title: 'Post', views: 42 };
 * const result = validateRow({ data, schema: postsSchema });
 *
 * if (result.status === 'valid') {
 *   // Use the data
 * } else {
 *   console.error('Validation failed:', result.reason);
 * }
 * ```
 */
export function validateRow<TTableSchema extends TableSchema>({
	data,
	schema,
}: {
	data: Record<string, unknown>;
	schema: TTableSchema;
}):
	| { status: 'valid' }
	| {
			status: 'schema-mismatch';
			reason:
				| { type: 'missing-required-field'; field: string }
				| { type: 'type-mismatch'; field: string; schemaType: string; actual: unknown }
				| { type: 'invalid-option'; field: string; actual: unknown; allowedOptions: readonly string[] };
	  } {
	// Schema validation - validate each field against schema constraints
	for (const [fieldName, columnSchema] of Object.entries(schema)) {
		const value = data[fieldName];

		// Check if required field is null/undefined
		if (value === null || value === undefined) {
			if (columnSchema.type === 'id' || !columnSchema.nullable) {
				return {
					status: 'schema-mismatch' as const,
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
				// For plain objects, ytext should be a string (will be converted to Y.Text later)
				if (typeof value !== 'string') {
					return {
						status: 'schema-mismatch' as const,
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
				// For plain objects, multi-select should be an array
				if (!Array.isArray(value)) {
					return {
						status: 'schema-mismatch' as const,
						reason: {
							type: 'type-mismatch' as const,
							field: fieldName,
							schemaType: columnSchema.type,
							actual: value,
						},
					};
				}
				// Validate each option in the array
				for (const option of value) {
					if (typeof option !== 'string') {
						return {
							status: 'schema-mismatch' as const,
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

	return { status: 'valid' as const };
}

/**
 * Creates a Proxy-wrapped YRow that provides type-safe property access and automatic validation.
 * This is what implements the `Row<T>` type - a Proxy that looks like a plain object
 * but delegates to the underlying YRow.
 *
 * The Proxy intercepts property access and delegates to the YRow:
 * - `row.content` → `yrow.get('content')`
 * - `row.toJSON()` → converts YRow to fully serialized object using schema
 * - `row.$yRow` → returns the underlying YRow
 *
 * **Automatic Validation**: This function automatically validates the row against the schema
 * and returns a `RowValidationResult`. The result is a discriminated union with three cases:
 * - `{ status: 'valid', row: Row }` - Row matches schema perfectly
 * - `{ status: 'schema-mismatch', row: Row, reason: ... }` - Row has valid structure but doesn't match schema
 * - `{ status: 'invalid-structure', row: unknown, reason: ... }` - Row has invalid structure
 *
 * For both 'valid' and 'schema-mismatch', you can access `result.row.toJSON()` to serialize the data.
 *
 * @param yrow - The YRow to wrap
 * @param schema - The table schema for proper serialization and validation
 * @returns RowValidationResult containing the validated Row
 */
export function createRow<TTableSchema extends TableSchema>({
	yrow,
	schema,
}: {
	yrow: YRow;
	schema: TTableSchema;
}): YRowValidationResult<Row<TTableSchema>> {
	// Create a TableSchemaWithValidation and call its method
	const tableSchema = createTableSchemaWithValidation(schema);
	return tableSchema.validateYRow(yrow);
}

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
 * Maps a ColumnSchema to its serialized cell value type.
 * This is the serialized equivalent of CellValue - what you get after calling serializeCellValue().
 * Uses a distributive conditional type to transform Y.js types to their serialized equivalents.
 * - Y.Text → string
 * - Y.Array<T> → T[]
 * - DateWithTimezone → DateWithTimezoneString
 * - Other types → unchanged
 *
 * @example
 * ```typescript
 * type IdSerialized = SerializedCellValue<{ type: 'id' }>; // string
 * type YtextSerialized = SerializedCellValue<{ type: 'ytext'; nullable: false }>; // string
 * type YtextNullable = SerializedCellValue<{ type: 'ytext'; nullable: true }>; // string | null
 * type MultiSelect = SerializedCellValue<{ type: 'multi-select'; nullable: false; options: readonly ['a', 'b'] }>; // string[]
 * type AnySerialized = SerializedCellValue; // Union of all possible serialized values
 * ```
 */
export type SerializedCellValue<C extends ColumnSchema = ColumnSchema> =
	CellValue<C> extends infer T
		? T extends Y.Text
			? string
			: T extends Y.Array<infer U>
				? U[]
				: T extends DateWithTimezone
					? DateWithTimezoneString
					: T
		: never;

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
	[K in keyof TTableSchema]: SerializedCellValue<TTableSchema[K]>;
};

/**
 * Type guard to check if a value is a valid SerializedCellValue.
 * Validates that the value is a plain JavaScript type (not a Y.js type).
 */
export function isSerializedCellValue(
	value: unknown,
): value is SerializedCellValue {
	// string | number | boolean | string[] | DateWithTimezoneString | null
	return (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean' ||
		(Array.isArray(value) && value.every((item) => typeof item === 'string'))
	);
}

/**
 * Type guard to check if an object is a valid SerializedRow.
 * Validates that all values are SerializedCellValue types.
 */
export function isSerializedRow(value: unknown): value is SerializedRow {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}

	// Check that all values are valid SerializedCellValue
	return Object.values(value).every(isSerializedCellValue);
}

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
export function serializeCellValue<T extends ColumnSchema>(
	value: CellValue<T>,
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

/**
 * Creates a TableSchemaWithValidation object from a schema definition.
 * Adds `validateYRow()`, `validateSerializedRow()`, and `validateRecord()` methods to the schema.
 *
 * @example
 * ```typescript
 * const schema = createTableSchemaWithValidation({
 *   id: id(),
 *   title: text(),
 *   content: ytext(),
 * });
 *
 * // Access schema fields directly
 * schema.title.type // 'text'
 *
 * // Validate from YRow
 * const result = schema.validateYRow(yrow);
 * if (result.status === 'valid') {
 *   console.log(result.row.title); // type-safe
 * }
 *
 * // Validate from typed SerializedRow
 * const serialized: SerializedRow<typeof schema> = { id: '123', title: 'Hello', content: 'World' };
 * const result2 = schema.validateSerializedRow(serialized);
 *
 * // Validate from unknown record
 * const result3 = schema.validateRecord({ id: '123', title: 'Hello', content: 'World' });
 * ```
 */
export function createTableSchemaWithValidation<TSchema extends TableSchema>(
	schema: TSchema,
): TableSchemaWithValidation<TSchema> {
	return {
		...schema,

		validateYRow(yrow: YRow): YRowValidationResult<Row<TSchema>> {
			// Create proxy
			const proxy = new Proxy(
				{},
				{
					get(_target, prop) {
						if (prop === 'toJSON') {
							return () => {
								const result: Record<string, unknown> = {};
								for (const key in schema) {
									const value = yrow.get(key);
									if (value !== undefined) {
										result[key] = serializeCellValue(value);
									}
								}
								return result as SerializedRow<TSchema>;
							};
						}

						if (prop === '$yRow') {
							return yrow;
						}

						if (typeof prop === 'string') {
							return yrow.get(prop);
						}

						return undefined;
					},

					has(_target, prop) {
						if (prop === 'toJSON' || prop === '$yRow') return true;
						return yrow.has(prop as string);
					},

					ownKeys(_target) {
						return [...yrow.keys(), 'toJSON', '$yRow'];
					},

					getOwnPropertyDescriptor(_target, prop) {
						if (prop === 'toJSON' || prop === '$yRow') {
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
			) as Row;

			// Perform validation
			for (const [fieldName, columnSchema] of Object.entries(schema)) {
				const value = proxy[fieldName];

				// Check if required field is null/undefined
				if (value === null || value === undefined) {
					if (columnSchema.type === 'id' || !columnSchema.nullable) {
						return {
							status: 'schema-mismatch',
							row: proxy,
							reason: {
								type: 'missing-required-field',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
									field: fieldName,
									schemaType: columnSchema.type,
									actual: value,
								},
							};
						}
						if (!columnSchema.options.includes(value)) {
							return {
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'invalid-option',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
									field: fieldName,
									schemaType: columnSchema.type,
									actual: value,
								},
							};
						}
						for (const option of value.toArray()) {
							if (typeof option !== 'string') {
								return {
									status: 'schema-mismatch',
									row: proxy,
									reason: {
										type: 'type-mismatch',
										field: fieldName,
										schemaType: columnSchema.type,
										actual: option,
									},
								};
							}
							if (!columnSchema.options.includes(option)) {
								return {
									status: 'schema-mismatch',
									row: proxy,
									reason: {
										type: 'invalid-option',
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
								status: 'schema-mismatch',
								row: proxy,
								reason: {
									type: 'type-mismatch',
									field: fieldName,
									schemaType: columnSchema.type,
									actual: value,
								},
							};
						}
						break;
				}
			}

			return { status: 'valid', row: proxy as Row<TSchema> };
		},

		validateSerializedRow(data: SerializedRow): ValidatedSerializedRowResult<TSchema> {
			// Validate the SerializedRow against the schema
			for (const [fieldName, columnSchema] of Object.entries(schema)) {
				const value = data[fieldName];

				// Check required fields
				if (value === null || value === undefined) {
					if (columnSchema.type === 'id' || !columnSchema.nullable) {
						return {
							status: 'schema-mismatch',
							row: data,
							reason: {
								type: 'missing-required-field',
								field: fieldName,
							},
						};
					}
					continue;
				}

				// Validate schema-level constraints (select options, etc.)
				switch (columnSchema.type) {
					case 'select':
						if (!columnSchema.options.includes(value as string)) {
							return {
								status: 'schema-mismatch',
								row: data,
								reason: {
									type: 'invalid-option',
									field: fieldName,
									actual: value as string,
									allowedOptions: columnSchema.options,
								},
							};
						}
						break;

					case 'multi-select':
						for (const option of value as string[]) {
							if (!columnSchema.options.includes(option)) {
								return {
									status: 'schema-mismatch',
									row: data,
									reason: {
										type: 'invalid-option',
										field: fieldName,
										actual: option,
										allowedOptions: columnSchema.options,
									},
								};
							}
						}
						break;
				}
			}

			// All validations passed
			return { status: 'valid', row: data as SerializedRow<TSchema> };
		},

		validateRecord(data: Record<string, unknown>): SerializedRowValidationResult<TSchema> {
			// First, validate that all values are valid SerializedCellValues
			for (const [fieldName, columnSchema] of Object.entries(schema)) {
				const value = data[fieldName];

				// Check required fields
				if (value === null || value === undefined) {
					if (columnSchema.type === 'id' || !columnSchema.nullable) {
						return {
							status: 'schema-mismatch',
							row: data as SerializedRow,
							reason: {
								type: 'missing-required-field',
								field: fieldName,
							},
						};
					}
					continue;
				}

				// Validate that the value is a valid SerializedCellValue type
				switch (columnSchema.type) {
					case 'id':
					case 'text':
					case 'ytext':
						if (typeof value !== 'string') {
							return {
								status: 'invalid-structure',
								row: data,
								reason: {
									type: 'invalid-cell-value',
									field: fieldName,
									actual: value,
								},
							};
						}
						break;

					case 'integer':
						if (typeof value !== 'number' || !Number.isInteger(value)) {
							return {
								status: 'invalid-structure',
								row: data,
								reason: {
									type: 'invalid-cell-value',
									field: fieldName,
									actual: value,
								},
							};
						}
						break;

					case 'real':
						if (typeof value !== 'number') {
							return {
								status: 'invalid-structure',
								row: data,
								reason: {
									type: 'invalid-cell-value',
									field: fieldName,
									actual: value,
								},
							};
						}
						break;

					case 'boolean':
						if (typeof value !== 'boolean') {
							return {
								status: 'invalid-structure',
								row: data,
								reason: {
									type: 'invalid-cell-value',
									field: fieldName,
									actual: value,
								},
							};
						}
						break;

					case 'select':
						if (typeof value !== 'string') {
							return {
								status: 'invalid-structure',
								row: data,
								reason: {
									type: 'invalid-cell-value',
									field: fieldName,
									actual: value,
								},
							};
						}
						// Check if it's a valid option (schema validation)
						if (!columnSchema.options.includes(value)) {
							return {
								status: 'schema-mismatch',
								row: data as SerializedRow,
								reason: {
									type: 'invalid-option',
									field: fieldName,
									actual: value,
									allowedOptions: columnSchema.options,
								},
							};
						}
						break;

					case 'multi-select':
						if (!Array.isArray(value)) {
							return {
								status: 'invalid-structure',
								row: data,
								reason: {
									type: 'invalid-cell-value',
									field: fieldName,
									actual: value,
								},
							};
						}
						// Validate array elements
						for (const option of value) {
							if (typeof option !== 'string') {
								return {
									status: 'invalid-structure',
									row: data,
									reason: {
										type: 'invalid-cell-value',
										field: fieldName,
										actual: option,
									},
								};
							}
							// Check if it's a valid option (schema validation)
							if (!columnSchema.options.includes(option)) {
								return {
									status: 'schema-mismatch',
									row: data as SerializedRow,
									reason: {
										type: 'invalid-option',
										field: fieldName,
										actual: option,
										allowedOptions: columnSchema.options,
									},
								};
							}
						}
						break;

					case 'date':
						if (!isDateWithTimezone(value) && !isDateWithTimezoneString(value)) {
							return {
								status: 'invalid-structure',
								row: data,
								reason: {
									type: 'invalid-cell-value',
									field: fieldName,
									actual: value,
								},
							};
						}
						break;
				}
			}

			// At this point, we've validated structure. Now we can treat it as SerializedRow
			// and delegate to validateSerializedRow for conversion to YRow and final validation
			return this.validateSerializedRow(data as SerializedRow<TSchema>);
		},
	};
}
