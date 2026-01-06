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
 *
 * This file contains all platform-agnostic exports shared between
 * browser and Node.js entry points.
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

export type { TableHelper, Tables } from './core/tables/core';

// Table utilities
export { createTables } from './core/tables/core';

export type { Kv, KvHelper } from './core/kv/core';
export { createKv } from './core/kv/core';

export type {
	DeleteManyResult,
	DeleteResult,
	GetResult,
	RowResult,
	UpdateManyResult,
	UpdateResult,
	YRow,
} from './core/tables/table-helper';
export type {
	EpicenterOperationError,
	IndexError,
	ValidationError,
} from './core/errors';
// Error types
export { EpicenterOperationErr, IndexErr, ValidationErr } from './core/errors';
export type {
	Provider,
	ProviderContext,
	Providers,
	WorkspaceProviderMap,
} from './core/provider';
// Provider system
export { defineProviders } from './core/provider';
export type {
	BooleanFieldSchema,
	CellValue,
	FieldSchema,
	FieldComponent,
	DateFieldSchema,
	DateIsoString,
	DateWithTimezoneString,
	Id,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
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
	TableSchema,
	TablesSchema,
	TagsFieldSchema,
	TextFieldSchema,
	TimezoneId,
	RichtextFieldSchema,
} from './core/schema';
// Column schema system
export {
	boolean,
	DATE_WITH_TIMEZONE_STRING_REGEX,
	DateWithTimezone,
	DateWithTimezoneFromString,
	date,
	generateId,
	ISO_DATETIME_REGEX,
	id,
	integer,
	isDateWithTimezone,
	isDateWithTimezoneString,
	isIsoDateTimeString,
	json,
	real,
	select,
	serializeCellValue,
	tableSchemaToArktype,
	tableSchemaToYjsArktype,
	TIMEZONE_ID_REGEX,
	tags,
	text,
	richtext,
} from './core/schema';
// Rich content ID generation
export type { RichContentId } from './core/rich-content/id';
export { createRichContentId } from './core/rich-content/id';
// Core types
export type { AbsolutePath, EpicenterDir, ProjectDir } from './core/types';
export type {
	CreateOptions,
	InferProviderExports,
	ProviderMap,
	Workspace,
	WorkspaceClient,
	WorkspaceSchema,
	WorkspaceWithProviders,
} from './core/workspace/contract';
export { defineWorkspace } from './core/workspace/contract';

// Note: Providers (markdown, sqlite) are NOT re-exported here to avoid bundling
// Node.js-only code in browser builds. Import them directly from subpaths:
//   import { markdownProvider } from '@epicenter/hq/providers/markdown';
//   import { sqliteProvider } from '@epicenter/hq/providers/sqlite';
