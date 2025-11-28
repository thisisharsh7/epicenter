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
	WorkspacesToExports,
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
	createTableValidators,
	createWorkspaceValidators,
	isIsoDateTimeString,
	isDateWithTimezoneString,
	isDateWithTimezone,
	DateWithTimezoneFromString,
	serializeCellValue,
	DATE_WITH_TIMEZONE_STRING_REGEX,
	ISO_DATETIME_REGEX,
	TIMEZONE_ID_REGEX,
} from './core/schema';
export { DateWithTimezone } from './core/schema';
export type {
	ColumnSchema,
	ColumnType,
	TableSchema,
	TableValidators,
	WorkspaceValidators,
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
} from './core/schema';

// Action helpers
export {
	defineQuery,
	defineMutation,
	isAction,
	isQuery,
	isMutation,
	isNamespace,
	extractActions,
	walkActions,
	defineWorkspaceExports,
} from './core/actions';
export type {
	Query,
	Mutation,
	Action,
	WorkspaceActionMap,
	WorkspaceExports,
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

// Blob storage
export {
	createTableBlobStore,
	createWorkspaceBlobs,
	BlobErr,
	validateFilename,
	getMimeType,
} from './core/blobs';
export type {
	TableBlobStore,
	WorkspaceBlobs,
	BlobData,
	BlobError,
	BlobContext,
} from './core/blobs';

// Server - expose workspaces as REST API and MCP servers
export { createServer } from './server';

// Core types
export type { AbsolutePath } from './core/types';

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
