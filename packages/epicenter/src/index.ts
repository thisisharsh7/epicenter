/**
 * Epicenter: YJS-First Collaborative Workspace System
 *
 * A unified architecture for building self-contained, globally synchronizable workspaces
 * with real-time collaboration via YJS.
 *
 * ## Core Concepts
 *
 * - **YJS Document**: Source of truth (CRDT, collaborative)
 * - **Providers**: Extensions that add persistence, sync, and materialized views
 * - **Column Schemas**: Pure JSON definitions (no Drizzle builders)
 *
 * ## Data Flow
 *
 * Write to YJS → Providers auto-sync → Query materialized views
 */

// Re-export commonly used Drizzle utilities for querying providers
export {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	inArray,
	isNotNull,
	isNull,
	like,
	lt,
	lte,
	ne,
	not,
	or,
	sql,
} from 'drizzle-orm';

export type { TableHelper, Tables } from './core/tables/create-tables';

// Table utilities
export { createTables } from './core/tables/create-tables';

export type { Kv, KvHelper } from './core/kv/core';
export { createKv } from './core/kv/core';

export type {
	DeleteManyResult,
	DeleteResult,
	GetResult,
	InvalidRowResult,
	NotFoundResult,
	RowResult,
	UpdateManyResult,
	UpdateResult,
	ValidRowResult,
} from './core/tables/table-helper';
export type { CapabilityError } from './core/errors';
// Error types
export { CapabilityErr } from './core/errors';
export type {
	Capability,
	CapabilityContext,
	CapabilityExports,
	CapabilityMap,
	InferCapabilityExports,
} from './core/capability';
// Capability system
export { defineCapabilities } from './core/capability';
export type {
	BooleanFieldSchema,
	CellValue,
	CoverDefinition,
	DateFieldSchema,
	DateIsoString,
	FieldMetadata,
	FieldSchema,
	FieldsSchema,
	FieldType,
	Guid,
	IconDefinition,
	Id,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	KvFieldSchema,
	KvSchema,
	KvValue,
	PartialRow,
	RealFieldSchema,
	RichtextFieldSchema,
	Row,
	SelectFieldSchema,
	TableDefinition,
	TableSchema,
	TablesSchema,
	TablesWithMetadata,
	TagsFieldSchema,
	TextFieldSchema,
	TimezoneId,
} from './core/schema';
// Column schema system
export {
	boolean,
	DATE_TIME_STRING_REGEX,
	date,
	DateTimeString,
	generateGuid,
	generateId,
	id,
	integer,
	isNullableFieldSchema,
	ISO_DATETIME_REGEX,
	json,
	real,
	richtext,
	select,
	tableSchemaToArktype,
	tableSchemaToYjsArktype,
	tags,
	text,
	TIMEZONE_ID_REGEX,
	toSqlIdentifier,
} from './core/schema';
// Rich content ID generation
export type { RichContentId } from './core/rich-content/id';
export { createRichContentId } from './core/rich-content/id';
// Core types
export type { AbsolutePath, EpicenterDir, ProjectDir } from './core/types';
export type {
	Workspace,
	WorkspaceClient,
	WorkspaceSchema,
} from './core/workspace/contract';
export { defineWorkspace } from './core/workspace/contract';

// Note: Capabilities (markdown, sqlite) are NOT re-exported here to avoid bundling
// Node.js-only code in browser builds. Import them directly from subpaths:
//   import { markdown } from '@epicenter/hq/capabilities/markdown';
//   import { sqlite } from '@epicenter/hq/capabilities/sqlite';
