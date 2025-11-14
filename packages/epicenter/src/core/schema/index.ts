/**
 * @fileoverview Schema module barrel file
 *
 * Main entry point for the schema system. Exports all public APIs organized by category.
 */

// ============================================================================
// Types
// ============================================================================
export type {
	// Column schema types
	IdColumnSchema,
	TextColumnSchema,
	YtextColumnSchema,
	IntegerColumnSchema,
	RealColumnSchema,
	BooleanColumnSchema,
	DateColumnSchema,
	SelectColumnSchema,
	TagsColumnSchema,
	JsonColumnSchema,
	ColumnSchema,
	ColumnType,

	// Table and workspace schemas
	TableSchema,
	WorkspaceSchema,

	// Value types
	CellValue,
	SerializedCellValue,
	Row,
	SerializedRow,
	PartialSerializedRow,
} from './types';

export type {
	// Validator types
	TableValidators,
	WorkspaceValidators,
} from './validation';

// ============================================================================
// Column Factories
// ============================================================================
export {
	id,
	text,
	ytext,
	integer,
	real,
	boolean,
	date,
	select,
	tags,
	json,
} from './columns';

// ============================================================================
// Validation
// ============================================================================
export {
	createTableValidators,
	createWorkspaceValidators,
} from './validation';

// ============================================================================
// Serialization
// ============================================================================
export { serializeCellValue } from './serialization';

// ============================================================================
// Utilities
// ============================================================================
export type { Id } from './id';
export { generateId } from './id';

export { safeToJsonSchema } from './safe-json-schema';

export type {
	DateIsoString,
	TimezoneId,
	DateWithTimezoneString,
} from './date-with-timezone';
export {
	DateWithTimezone,
	isDateWithTimezone,
	isDateWithTimezoneString,
	DateWithTimezoneFromString,
} from './date-with-timezone';

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

// ============================================================================
// Regex
// ============================================================================
export {
	DATE_WITH_TIMEZONE_STRING_REGEX,
	ISO_DATETIME_REGEX,
	TIMEZONE_ID_REGEX,
} from './regex';
