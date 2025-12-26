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

export type {
	Action,
	Mutation,
	Query,
	WorkspaceActionMap,
	WorkspaceExports,
} from './core/actions';

// Action helpers
export {
	defineMutation,
	defineQuery,
	defineWorkspaceExports,
	extractActions,
	isAction,
	isMutation,
	isNamespace,
	isQuery,
	walkActions,
} from './core/actions';

export type { TableHelper, Tables } from './core/db/core';

// Database utilities
export { createEpicenterDb } from './core/db/core';

export type {
	DeleteManyResult,
	DeleteResult,
	GetResult,
	RowResult,
	UpdateManyResult,
	UpdateResult,
	YRow,
} from './core/db/table-helper';
export type {
	EpicenterOperationError,
	IndexError,
	ValidationError,
} from './core/errors';
// Error types
export {
	EpicenterOperationErr,
	IndexErr,
	ValidationErr,
} from './core/errors';
export type {
	Provider,
	ProviderContext,
	ProviderExports,
	WorkspaceProviderMap,
} from './core/provider';
// Provider system
export { defineProviderExports } from './core/provider';
export type {
	BooleanColumnSchema,
	CellValue,
	ColumnSchema,
	ColumnType,
	DateColumnSchema,
	DateIsoString,
	DateWithTimezoneString,
	Id,
	IdColumnSchema,
	IntegerColumnSchema,
	JsonColumnSchema,
	PartialSerializedRow,
	RealColumnSchema,
	Row,
	SelectColumnSchema,
	SerializedCellValue,
	SerializedRow,
	TableSchema,
	TableValidators,
	TagsColumnSchema,
	TextColumnSchema,
	TimezoneId,
	WorkspaceSchema,
	WorkspaceValidators,
	YtextColumnSchema,
} from './core/schema';
// Column schema system
export {
	boolean,
	createTableValidators,
	createWorkspaceValidators,
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
	TIMEZONE_ID_REGEX,
	tags,
	text,
	ytext,
} from './core/schema';
// Core types
export type { AbsolutePath, EpicenterDir, ProjectDir } from './core/types';
export type { ActionInfo } from './core/workspace/client.shared';
export { iterActions } from './core/workspace/client.shared';

export type {
	AnyWorkspaceConfig,
	WorkspaceConfig,
	WorkspacesToExports,
} from './core/workspace/config';
export { defineWorkspace } from './core/workspace/config';

// Note: Providers (markdown, sqlite) are NOT re-exported here to avoid bundling
// Node.js-only code in browser builds. Import them directly from subpaths:
//   import { markdownProvider } from '@epicenter/hq/indexes/markdown';
//   import { sqliteProvider } from '@epicenter/hq/indexes/sqlite';
