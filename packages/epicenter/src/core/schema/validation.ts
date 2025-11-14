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
import { tableSchemaToArktypeType } from './converters/arktype';
import { isDateWithTimezoneString } from './date-with-timezone';
import type {
	ColumnSchema,
	PartialSerializedRow,
	Row,
	SerializedRow,
	TableSchema,
	WorkspaceSchema,
} from './types';

/**
 * Reasons why validation failed
 */
export type ValidationReason =
	| {
			type: 'not-an-object';
			actual: unknown;
	  }
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
 * Two possible states:
 * - valid: Data matches schema perfectly
 * - invalid: Data doesn't match schema (check reason for specifics)
 */
export type RowValidationResult<TRow extends Row> =
	| { status: 'valid'; row: TRow }
	| { status: 'invalid'; row: unknown; reason: ValidationReason };

/**
 * Refined validation result that only includes 'valid' and 'invalid' with Row type.
 * Used by createRow which works with YRow (CRDT) data that's already a proper Row object.
 */
export type YRowValidationResult<TRow extends Row> =
	| { status: 'valid'; row: TRow }
	| { status: 'invalid'; row: Row; reason: ValidationReason };

/**
 * Validation result for SerializedRow.
 * Returns the validated SerializedRow (not Row proxy) on success.
 *
 * Two possible states:
 * - valid: Data matches schema (typed as SerializedRow<TSchema>)
 * - invalid: Data doesn't match schema (check reason for specifics)
 */
export type SerializedRowValidationResult<
	TSchema extends TableSchema = TableSchema,
> =
	| { status: 'valid'; row: SerializedRow<TSchema> }
	| { status: 'invalid'; row: unknown; reason: ValidationReason };

/**
 * Discriminated union representing the result of getting a row by ID
 * Three possible states:
 * - valid: Row exists and matches schema perfectly
 * - invalid: Row exists but doesn't match schema
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
 * // Validate unknown data against the schema
 * const result = validators.validateUnknown(someUnknownData);
 * if (result.status === 'valid') {
 *   console.log(result.row.title); // type-safe access
 * }
 * ```
 */
export type TableValidators<TSchema extends TableSchema = TableSchema> = {
	/**
	 * Validates unknown data against the table schema
	 *
	 * **This performs actual validation**: Unlike the `toXyz()` methods which generate
	 * schemas for external tooling, this method performs rigorous runtime validation
	 * including complex cases like JSON columns via StandardSchemaV1.
	 *
	 * **Validation steps**:
	 * 1. Checks if data is a plain object
	 * 2. Validates each schema field against the column schema
	 *
	 * **Important**: Extra fields (not in schema) are ignored. Only schema-defined
	 * fields are validated. This allows forward compatibility when deserializing
	 * data that may have additional fields.
	 *
	 * **Returns a discriminated union**:
	 * - 'valid': Data passes all checks (typed as SerializedRow<TSchema>)
	 * - 'invalid': Data doesn't match schema (check reason.type for specifics)
	 */
	validateUnknown(data: unknown): SerializedRowValidationResult<TSchema>;

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
 * // Use validators for runtime validation
 * const result = validators.posts.validateUnknown({ id: '1', title: 'Hello', content: 'World' });
 * if (result.status === 'valid') {
 *   console.log(result.row.title); // type-safe access
 * }
 *
 * // Use validators for action input schemas
 * const insertMutation = defineMutation({
 *   input: validators.posts.toStandardSchema(),
 *   handler: (row) => { ... }
 * });
 *
 * // Use validators for composable arktype schemas
 * const PostFrontmatter = validators.posts.toArktype().omit('id', 'content');
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
 * **1. Rigorous Runtime Validation** (via `validateUnknown()`):
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
 * - JSON columns return `type.unknown` (actual validation happens in validateUnknown)
 * - Date columns use `.matching(regex)` instead of `.filter()` predicates
 * - No custom predicates that can't be represented in JSON Schema
 *
 * @example
 * ```typescript
 * const schema = {
 *   id: id(),
 *   title: text(),
 *   content: ytext(),
 *   metadata: json(myStandardSchema), // Validates properly at runtime, type.unknown in schemas
 * };
 * const validators = createTableValidators(schema);
 *
 * // 1. Rigorous runtime validation
 * const result = validators.validateUnknown(someData);
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
 * const result2 = FrontMatter(frontmatter);
 * ```
 */
export function createTableValidators<TSchema extends TableSchema>(
	schema: TSchema,
): TableValidators<TSchema> {

	return {
		validateUnknown(data: unknown): SerializedRowValidationResult<TSchema> {
			// Step 1: Check if it's a plain object
			if (!type("Record<string, unknown>").allows(data)) {
				return {
					status: 'invalid',
					row: data,
					reason: {
						type: 'not-an-object',
						actual: data,
					},
				};
			}

			// Step 2: Validate against the schema
			for (const [fieldName, columnSchema] of Object.entries(schema)) {
				const value = data[fieldName];

				// Check required fields
				if (value === null || value === undefined) {
					if (columnSchema.type === 'id' || !columnSchema.nullable) {
						return {
							status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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
									status: 'invalid',
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
									status: 'invalid',
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
								status: 'invalid',
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
								status: 'invalid',
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