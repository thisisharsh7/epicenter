/**
 * @fileoverview Schema module barrel file
 *
 * Main entry point for the schema system. Exports all public APIs organized by category.
 */

// ============================================================================
// Column Factories
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
} from './columns';
// ============================================================================
// Converters
// ============================================================================
export type { ColumnSchemaToArktypeType } from './converters/arktype';
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
export { generateJsonSchema } from './generate-json-schema';
// ============================================================================
// Utilities
// ============================================================================
export type { Id } from './id';
export { generateId } from './id';
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
	BooleanColumnSchema,
	// Value types
	CellValue,
	ColumnSchema,
	ColumnType,
	DateColumnSchema,
	// Column schema types
	IdColumnSchema,
	IntegerColumnSchema,
	JsonColumnSchema,
	// KV schema types
	KvColumnSchema,
	KvSchema,
	KvValue,
	PartialSerializedRow,
	RealColumnSchema,
	Row,
	SelectColumnSchema,
	SerializedCellValue,
	SerializedKvValue,
	SerializedRow,
	// Table and workspace schemas
	TableSchema,
	TagsColumnSchema,
	TextColumnSchema,
	WorkspaceSchema,
	YtextColumnSchema,
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
