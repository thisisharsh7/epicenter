/**
 * Epicenter: YJS-First Collaborative Workspace System
 *
 * A unified architecture for building self-contained, globally synchronizable workspaces
 * with real-time collaboration via YJS.
 *
 * ## Core Concepts
 *
 * - **YJS Document**: Source of truth (CRDT, collaborative)
 * - **Indexes**: Synchronized snapshots for different query patterns
 * - **Column Schemas**: Pure JSON definitions (no Drizzle builders)
 *
 * ## Data Flow
 *
 * Write to YJS → Indexes auto-sync → Query indexes
 */

// Core workspace definition
export { defineWorkspace } from './core/workspace';
export type {
	WorkspaceConfig,
	AnyWorkspaceConfig,
	WorkspacesToActionMaps,
	WorkspacesToClients,
	Provider,
	ProviderContext,
} from './core/workspace';

// Column schema system
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
	generateId,
	validateRow,
	createTableSchemaWithValidation,
	isDateWithTimezoneString,
	isDateWithTimezone,
	DateWithTimezoneFromString,
	createRow,
	serializeCellValue,
	isSerializedCellValue,
	isSerializedRow,
} from './core/schema';
export { DateWithTimezone } from './core/schema';
export type {
	ColumnSchema,
	ColumnType,
	TableSchema,
	TableSchemaWithValidation,
	YRowValidationResult,
	SerializedRowValidationResult,
	ValidatedSerializedRowResult,
	Row,
	SerializedRow,
	PartialSerializedRow,
	Id,
	DateWithTimezoneString,
	DateIsoString,
	TimezoneId,
	IdColumnSchema,
	TextColumnSchema,
	YtextColumnSchema,
	IntegerColumnSchema,
	RealColumnSchema,
	BooleanColumnSchema,
	DateColumnSchema,
	SelectColumnSchema,
	TagsColumnSchema,
	WorkspaceSchema,
	CellValue,
	SerializedCellValue,
	RowValidationResult,
	GetRowResult,
} from './core/schema';

// Action helpers
export {
	defineQuery,
	defineMutation,
	isQuery,
	isMutation,
} from './core/actions';
export type {
	Query,
	Mutation,
	Action,
	WorkspaceActionMap,
} from './core/actions';

// Runtime
export { createWorkspaceClient } from './core/workspace';
export type { WorkspaceClient } from './core/workspace';

// Epicenter - compose multiple workspaces
export {
	defineEpicenter,
	createEpicenterClient,
	forEachAction,
} from './core/epicenter';
export type { EpicenterConfig, EpicenterClient } from './core/epicenter';

// Database utilities
export { createEpicenterDb } from './core/db/core';
export type { TableHelper, Db } from './core/db/core';
export {
	RowAlreadyExistsErr,
	RowNotFoundErr,
} from './core/db/table-helper';
export type {
	RowAlreadyExistsError,
	RowNotFoundError,
	YRow,
} from './core/db/table-helper';

// Index system
export { defineIndexExports } from './core/indexes';
export type {
	Index,
	IndexExports,
	IndexContext,
	WorkspaceIndexMap,
} from './core/indexes';

// Indexes (implementations)
export { sqliteIndex } from './indexes/sqlite';

export { markdownIndex } from './indexes/markdown';
export type { MarkdownIndexConfig } from './indexes/markdown';

// Error types
export {
	EpicenterOperationErr,
	IndexErr,
	ValidationErr,
} from './core/errors';
export type {
	EpicenterOperationError,
	IndexError,
	ValidationError,
} from './core/errors';

// Server - expose workspaces as REST API and MCP servers
export { createServer } from './server';

// Re-export commonly used Drizzle utilities for querying indexes
export {
	eq,
	ne,
	gt,
	gte,
	lt,
	lte,
	and,
	or,
	not,
	like,
	inArray,
	isNull,
	isNotNull,
	sql,
	desc,
	asc,
} from 'drizzle-orm';
