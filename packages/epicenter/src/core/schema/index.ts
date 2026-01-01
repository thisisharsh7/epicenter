/**
 * @fileoverview Schema module barrel file
 *
 * Main entry point for the schema system. Exports all public APIs organized by category.
 */

// ============================================================================
// Field Factories
// ============================================================================
export {
	boolean,
	date,
	id,
	integer,
	json,
	real,
	select,
	tags,
	text,
	ytext,
} from './fields';
// ============================================================================
// Converters
// ============================================================================
export type { FieldSchemaToArktypeType } from './converters/arktype';
export { tableSchemaToArktypeType } from './converters/arktype';
export type { WorkspaceSchemaToDrizzleTables } from './converters/drizzle';
export {
	convertTableSchemaToDrizzle,
	convertWorkspaceSchemaToDrizzle,
} from './converters/drizzle';
export type {
	DateIsoString,
	DateWithTimezoneString,
	TimezoneId,
} from './date-with-timezone';
export {
	DateWithTimezone,
	DateWithTimezoneFromString,
	isDateWithTimezone,
	isDateWithTimezoneString,
	isIsoDateTimeString,
} from './date-with-timezone';
export { generateJsonSchema } from './converters/json-schema';
// ============================================================================
// Utilities
// ============================================================================
export type { Id } from './id';
export { generateId } from './id';
export { isNullableFieldSchema } from './nullability';
// ============================================================================
// Regex
// ============================================================================
export {
	DATE_WITH_TIMEZONE_STRING_REGEX,
	ISO_DATETIME_REGEX,
	TIMEZONE_ID_REGEX,
} from './regex';
// ============================================================================
// Serialization
// ============================================================================
export { serializeCellValue } from './serialization';
// ============================================================================
// Standard Schema
// ============================================================================
export type {
	StandardJSONSchemaV1,
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
	StandardTypedV1,
} from './standard-schema';
// ============================================================================
// Types
// ============================================================================
export type {
	BooleanFieldSchema,
	// Value types
	CellValue,
	FieldComponent,
	FieldSchema,
	DateFieldSchema,
	// Field schema types
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	// KV schema types
	KvFieldSchema,
	KvSchema,
	KvValue,
	PartialSerializedRow,
	RealFieldSchema,
	Row,
	SelectFieldSchema,
	SerializedCellValue,
	SerializedKvValue,
	SerializedRow,
	// Table and workspace schemas
	TableSchema,
	TagsFieldSchema,
	TextFieldSchema,
	WorkspaceSchema,
	YtextFieldSchema,
} from './types';
export type {
	// Validator types
	TableValidators,
	WorkspaceValidators,
} from './validation';
// ============================================================================
// Validation
// ============================================================================
export {
	createTableValidators,
	createWorkspaceValidators,
} from './validation';
