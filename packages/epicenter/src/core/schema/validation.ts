/**
 * @fileoverview Schema validation functions and validators
 *
 * Provides comprehensive validation for table schemas, including:
 * - Runtime validation of YRow (CRDT) and SerializedRow (plain JS) data
 * - Schema generation for action inputs (toStandardSchema)
 * - Composable arktype schemas (toArktype)
 */

import type { StandardSchemaV1 } from '@standard-schema/spec';
import { type, type ArkErrors } from 'arktype';
import type { ObjectType } from 'arktype/internal/variants/object.ts';
import * as Y from 'yjs';
import { isPlainObject } from '../../indexes/markdown/io';
import type { YRow } from '../db/table-helper';
import { tableSchemaToArktypeType } from './converters/arktype';
import { isDateWithTimezoneString } from './date-with-timezone';
import { serializeCellValue } from './serialization';
import { isSerializedCellValue } from './type-guards';
import type {
	ColumnSchema,
	PartialSerializedRow,
	Row,
	SerializedRow,
	TableSchema,
	WorkspaceSchema,
} from './types';

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
export type ValidatedSerializedRowResult<
	TSchema extends TableSchema = TableSchema,
> =
	| { status: 'valid'; row: SerializedRow<TSchema> }
	| {
			status: 'schema-mismatch';
			row: SerializedRow;
			reason: SchemaMismatchReason;
	  };

/**
 * Validation result for SerializedRow.
 * Returns the validated SerializedRow (not Row proxy) on success.
 *
 * Extends ValidatedSerializedRowResult by adding the 'invalid-structure' case.
 */
export type SerializedRowValidationResult<
	TSchema extends TableSchema = TableSchema,
> =
	| ValidatedSerializedRowResult<TSchema>
	| {
			status: 'invalid-structure';
			row: unknown;
			reason: InvalidStructureReason;
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
 * Table validators - validation methods for a table schema.
 * Created by `createTableValidators()` from a `TableSchema`.
 * Contains only validation methods, separate from the schema definition.
 *
 * @example
 * ```typescript
 * const validators = createTableValidators({
 *   id: id(),
 *   title: text(),
 *   content: ytext(),
 * });
 *
 * // Validate from unknown data (checks if object, then delegates)
 * const result1 = validators.validateUnknown(someUnknownData);
 *
 * // Validate from record (checks if values are SerializedCellValue, then delegates)
 * const result2 = validators.validateRecord({ id: '123', title: 'Hello', content: 'World' });
 *
 * // Validate from SerializedRow (validates schema only)
 * const serialized: SerializedRow = { id: '123', title: 'Hello', content: 'World' };
 * const result3 = validators.validateSerializedRow(serialized);
 *
 * // Validate from YRow (validates schema only)
 * const result4 = validators.validateYRow(yrow);
 * ```
 */
export type TableValidators<TSchema extends TableSchema = TableSchema> = {
	/**
	 * Validates unknown data (checks if object), then delegates to validateRecord
	 *
	 * **This performs actual validation**: Unlike the `toXyz()` methods which generate
	 * schemas for external tooling, this method performs rigorous runtime validation
	 * including complex cases like JSON columns via StandardSchemaV1.
	 */
	validateUnknown(data: unknown): SerializedRowValidationResult<TSchema>;

	/**
	 * Validates a record (checks if values are SerializedCellValue), then delegates to validateSerializedRow
	 *
	 * **This performs actual validation**: Unlike the `toXyz()` methods which generate
	 * schemas for external tooling, this method performs rigorous runtime validation
	 * including complex cases like JSON columns via StandardSchemaV1.
	 */
	validateRecord(
		data: Record<string, unknown>,
	): SerializedRowValidationResult<TSchema>;

	/**
	 * Validates a SerializedRow (checks schema only), returns validated SerializedRow<TSchema>
	 *
	 * **This performs actual validation**: Unlike the `toXyz()` methods which generate
	 * schemas for external tooling, this method performs rigorous runtime validation
	 * including complex cases like JSON columns via StandardSchemaV1.
	 */
	validateSerializedRow(
		data: SerializedRow,
	): ValidatedSerializedRowResult<TSchema>;

	/**
	 * Validates a YRow (checks schema only), returns typed Row proxy
	 *
	 * **This performs actual validation**: Unlike the `toXyz()` methods which generate
	 * schemas for external tooling, this method performs rigorous runtime validation
	 * including complex cases like JSON columns via StandardSchemaV1.
	 */
	validateYRow(yrow: YRow): YRowValidationResult<Row<TSchema>>;

	/**
	 * Generates a StandardSchemaV1 for full SerializedRow
	 *
	 * **Primary use case**: Action input schemas
	 * - Used as `input` parameter for mutations (insert, upsert)
	 * - Provides runtime validation via `action.input['~standard'].validate(args)`
	 * - Later converted to JSON Schema by MCP server/OpenAPI generator
	 *
	 * **Example**:
	 * ```typescript
	 * insert: defineMutation({
	 *   input: validators.toStandardSchema(),  // ← Action input
	 *   handler: (serializedRow) => { ... }
	 * })
	 * ```
	 *
	 * **Schema generation flow**:
	 * 1. This method returns StandardSchemaV1
	 * 2. Action uses it as `input` for validation
	 * 3. MCP server converts it to JSON Schema via `toJsonSchema(action.input)`
	 */
	toStandardSchema(): StandardSchemaV1<SerializedRow<TSchema>>;

	/**
	 * Generates a StandardSchemaV1 for partial SerializedRow (all fields except id are optional)
	 *
	 * **Primary use case**: Update action input schemas
	 * - Used for update operations where only some fields are provided
	 * - Example: `update: defineMutation({ input: validators.toPartialStandardSchema() })`
	 */
	toPartialStandardSchema(): StandardSchemaV1<PartialSerializedRow<TSchema>>;

	/**
	 * Generates a StandardSchemaV1 for an array of SerializedRows
	 *
	 * **Primary use case**: Batch insert/upsert action input schemas
	 * - Used for operations that accept multiple rows at once
	 * - Example: `insertMany: defineMutation({ input: validators.toStandardSchemaArray() })`
	 */
	toStandardSchemaArray(): StandardSchemaV1<SerializedRow<TSchema>[]>;

	/**
	 * Generates a StandardSchemaV1 for an array of partial SerializedRows
	 *
	 * **Primary use case**: Batch update action input schemas
	 * - Used for bulk update operations with partial data
	 * - Example: `updateMany: defineMutation({ input: validators.toPartialStandardSchemaArray() })`
	 */
	toPartialStandardSchemaArray(): StandardSchemaV1<
		PartialSerializedRow<TSchema>[]
	>;

	/**
	 * Generates an Arktype schema for full SerializedRow
	 *
	 * **Primary use case**: Runtime validation with arktype's composition API
	 * - Use with `.omit()`, `.partial()`, `.pick()` for validating subsets of data
	 * - Common pattern: Validating frontmatter without auto-managed fields
	 * - NOT primarily for JSON Schema generation (use StandardSchemaV1 methods for that)
	 *
	 * **Example**:
	 * ```typescript
	 * // Validate frontmatter excluding id and content
	 * const FrontMatter = table.validators.toArktype().omit('id', 'content');
	 * const result = FrontMatter(frontmatter);
	 * if (result instanceof type.errors) {
	 *   // Handle validation errors
	 * }
	 * ```
	 *
	 * **Real-world usage**:
	 * - Markdown index deserialization (excluding id/content from frontmatter)
	 * - Migration scripts (partial validation with `.omit().partial()`)
	 * - Any scenario requiring validation of schema subsets
	 */
	toArktype(): ObjectType<SerializedRow<TSchema>>;
};

/**
 * Workspace validators - maps table names to their table validators
 */
export type WorkspaceValidators<TWorkspaceSchema extends WorkspaceSchema> = {
	[TTableName in keyof TWorkspaceSchema]: TableValidators<
		TWorkspaceSchema[TTableName]
	>;
};

/**
 * Creates workspace validators by mapping over all tables in a workspace schema.
 * Returns an object where each key is a table name and each value is the table's validators.
 *
 * @example
 * ```typescript
 * const validators = createWorkspaceValidators({
 *   posts: { id: id(), title: text(), content: ytext() },
 *   users: { id: id(), name: text(), email: text() }
 * });
 *
 * // Access validators for a specific table
 * const postResult = validators.posts.validateYRow(yrow);
 * const userResult = validators.users.validateSerializedRow(serializedRow);
 * ```
 */
export function createWorkspaceValidators<
	TWorkspaceSchema extends WorkspaceSchema,
>(schema: TWorkspaceSchema): WorkspaceValidators<TWorkspaceSchema> {
	return Object.fromEntries(
		Object.entries(schema).map(([tableName, tableSchema]) => [
			tableName,
			createTableValidators(tableSchema),
		]),
	) as WorkspaceValidators<TWorkspaceSchema>;
}

/**
 * Creates table validators from a schema definition.
 * Returns validation methods and schema generation utilities.
 *
 * **Architecture Overview**: This function provides three distinct capabilities:
 *
 * **1. Rigorous Runtime Validation** (via `validateXyz()` methods):
 * - Performs thorough validation of data at runtime
 * - Uses full StandardSchemaV1 capabilities (not limited by JSON Schema)
 * - JSON columns validated properly via their StandardSchemaV1 schemas
 * - Date columns validated with custom predicates
 * - Returns type-safe Row objects when validation succeeds
 *
 * **2. Action Input Schemas** (via `toStandardSchema()` and variants):
 * - Generates StandardSchemaV1 for action `input` parameters
 * - Used by mutations (insert, update, upsert, etc.) for input validation
 * - Provides runtime validation via `action.input['~standard'].validate(args)`
 * - Later converted to JSON Schema by MCP server/OpenAPI generator
 * - Must use JSON Schema-compatible features (no custom predicates like `.filter()`)
 *
 * **3. Composable Validation** (via `toArktype()` and variants):
 * - Returns arktype schemas that can be composed using `.omit()`, `.partial()`, `.pick()`
 * - Used for validating subsets of data (e.g., frontmatter without id/content)
 * - Common in markdown deserialization and migration scripts
 * - NOT primarily for JSON Schema generation
 *
 * **Key constraint**: StandardSchemaV1 methods must maintain JSON Schema compatibility
 * because MCP servers and OpenAPI generators convert them to JSON Schema. This means:
 * - JSON columns return `type.unknown` (actual validation happens in validateXyz methods)
 * - Date columns use `.matching(regex)` instead of `.filter()` predicates
 * - No custom predicates that can't be represented in JSON Schema
 *
 * @example
 * ```typescript
 * const validators = createTableValidators({
 *   id: id(),
 *   title: text(),
 *   content: ytext(),
 *   metadata: json(myStandardSchema), // Validates properly at runtime, type.unknown in schemas
 * });
 *
 * // 1. Rigorous runtime validation
 * const result = validators.validateYRow(yrow);
 * if (result.status === 'valid') {
 *   console.log(result.row.title); // type-safe
 * }
 *
 * // 2. Action input schema
 * const insertMutation = defineMutation({
 *   input: validators.toStandardSchema(),  // For action input validation
 *   handler: (row) => { ... }
 * });
 *
 * // 3. Composable validation
 * const FrontMatter = validators.toArktype().omit('id', 'content');
 * const result = FrontMatter(frontmatter);
 * ```
 */
export function createTableValidators<TSchema extends TableSchema>(
	schema: TSchema,
): TableValidators<TSchema> {

	return {
		validateYRow(yrow: YRow): YRowValidationResult<Row<TSchema>> {
			// Create row with getters for each property
			const row = buildRowFromYRow(yrow, schema);

			// Perform validation
			for (const [fieldName, columnSchema] of Object.entries(schema)) {
				const value = row[fieldName];

				// Check if required field is null/undefined
				if (value === null || value === undefined) {
					if (columnSchema.type === 'id' || !columnSchema.nullable) {
						return {
							status: 'schema-mismatch',
							row,
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
								row,
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
								row,
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
								row,
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
								row,
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
								row,
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
								row,
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
								row,
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
								row,
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
									row,
									reason: {
										type: 'type-mismatch',
										field: fieldName,
										schemaType: columnSchema.type,
										actual: option,
									},
								};
							}
							if (
								columnSchema.options &&
								!columnSchema.options.includes(option)
							) {
								return {
									status: 'schema-mismatch',
									row,
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
						if (!isDateWithTimezoneString(value)) {
							return {
								status: 'schema-mismatch',
								row,
								reason: {
									type: 'type-mismatch',
									field: fieldName,
									schemaType: columnSchema.type,
									actual: value,
								},
							};
						}
						break;

					case 'json': {
						// Validate using Arktype
						const result = columnSchema.schema(value) as typeof columnSchema.schema.infer | ArkErrors;
						if (result instanceof type.errors) {
							return {
								status: 'schema-mismatch',
								row,
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
			}

			return { status: 'valid', row };
		},

		validateSerializedRow(
			data: SerializedRow,
		): ValidatedSerializedRowResult<TSchema> {
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

				// Type-specific validation
				switch (columnSchema.type) {
					case 'id':
					case 'text':
						if (typeof value !== 'string') {
							return {
								status: 'schema-mismatch',
								row: data,
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
								row: data,
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
								row: data,
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
								row: data,
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
						// For SerializedRow, ytext should be a string
						if (typeof value !== 'string') {
							return {
								status: 'schema-mismatch',
								row: data,
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
								row: data,
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
								row: data,
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
						// For SerializedRow, multi-select should be an array
						if (!Array.isArray(value)) {
							return {
								status: 'schema-mismatch',
								row: data,
								reason: {
									type: 'type-mismatch',
									field: fieldName,
									schemaType: columnSchema.type,
									actual: value,
								},
							};
						}
						for (const option of value) {
							if (typeof option !== 'string') {
								return {
									status: 'schema-mismatch',
									row: data,
									reason: {
										type: 'type-mismatch',
										field: fieldName,
										schemaType: columnSchema.type,
										actual: option,
									},
								};
							}
							if (
								columnSchema.options &&
								!columnSchema.options.includes(option)
							) {
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

					case 'date':
						if (!isDateWithTimezoneString(value)) {
							return {
								status: 'schema-mismatch',
								row: data,
								reason: {
									type: 'type-mismatch',
									field: fieldName,
									schemaType: columnSchema.type,
									actual: value,
								},
							};
						}
						break;

					case 'json': {
						// Validate using Arktype
						const result = columnSchema.schema(value) as typeof columnSchema.schema.infer | ArkErrors;
						if (result instanceof type.errors) {
							return {
								status: 'schema-mismatch',
								row: data,
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
			}

			// All validations passed
			return { status: 'valid', row: data as SerializedRow<TSchema> };
		},

		validateUnknown(data: unknown): SerializedRowValidationResult<TSchema> {
			// Check if it's an object
			if ((!(isPlainObject(data)))) {
				return {
					status: 'invalid-structure',
					row: data,
					reason: {
						type: 'not-an-object',
						actual: data,
					},
				};
			}

			// Delegate to validateRecord
			return this.validateRecord(data);
		},

		validateRecord(
			data: Record<string, unknown>,
		): SerializedRowValidationResult<TSchema> {
			// Check if all values are SerializedCellValue
			for (const [fieldName, value] of Object.entries(data)) {
				if (!isSerializedCellValue(value)) {
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
			}

			// Delegate to validateSerializedRow for schema validation
			return this.validateSerializedRow(data as SerializedRow<TSchema>);
		},

		toArktype() {
			return tableSchemaToArktypeType(schema);
		},

		toStandardSchema() {
			return this.toArktype() as StandardSchemaV1<SerializedRow<TSchema>>;
		},

		toPartialStandardSchema() {
			// Make all keys optional, then override 'id' to remain required
			return this.toArktype()
				.partial()
				.merge({ id: "string" }) as StandardSchemaV1<
				PartialSerializedRow<TSchema>
			>;
		},

		toStandardSchemaArray() {
			return this.toArktype().array() as StandardSchemaV1<
				SerializedRow<TSchema>[]
			>;
		},

		toPartialStandardSchemaArray() {
			return this.toArktype()
				.partial()
				.merge({ id: type.string })
				.array() as StandardSchemaV1<PartialSerializedRow<TSchema>[]>;
		},
	};
}


/**
 * Creates a Row object from a YRow with getters for each property.
 * Properly inspectable in console.log while maintaining transparent delegation to YRow.
 * Includes toJSON and $yRow as non-enumerable properties.
 *
 * @internal
 */
function buildRowFromYRow<TSchema extends TableSchema>(
	yrow: YRow,
	schema: TSchema,
): Row<TSchema> {
	const descriptors = Object.fromEntries(
		Array.from(yrow.keys()).map((key) => [
			key,
			{
				get: () => yrow.get(key),
				enumerable: true,
				configurable: true,
			},
		]),
	);

	const row: Record<string, unknown> = {};
	Object.defineProperties(row, descriptors);

	// Add special properties as non-enumerable
	Object.defineProperties(row, {
		toJSON: {
			value: () => {
				const result: Record<string, unknown> = {};
				for (const key in schema) {
					const value = yrow.get(key);
					if (value !== undefined) {
						result[key] = serializeCellValue(value);
					}
				}
				return result as SerializedRow<TSchema>;
			},
			enumerable: false,
			configurable: true,
		},
		$yRow: {
			value: yrow,
			enumerable: false,
			configurable: true,
		},
	});

	return row as Row<TSchema>;
}

/**
 * Helper function to create a Row from a YRow with validation.
 * Convenience wrapper around validators.validateYRow().
 *
 * @param yrow - The YRow to validate and convert
 * @param validators - Table validators for the schema
 * @returns Validation result with typed Row if valid
 *
 * @example
 * ```typescript
 * const validators = createTableValidators(schema);
 * const result = createRow({ yrow, validators });
 * if (result.status === 'valid') {
 *   console.log(result.row.title); // type-safe access
 * }
 * ```
 */
export function createRow<TTableSchema extends TableSchema>({
	yrow,
	validators,
}: {
	yrow: YRow;
	validators: TableValidators<TTableSchema>;
}): YRowValidationResult<Row<TTableSchema>> {
	return validators.validateYRow(yrow);
}
