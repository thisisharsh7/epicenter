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
export { defineWorkspace, extractHandlers } from './core/workspace';
export type {
	WorkspaceConfig,
	WorkspaceActionContext,
	ExtractHandlers,
} from './core/workspace';

// Column schema system
export {
	id,
	text,
	ytext,
	yxmlfragment,
	integer,
	real,
	boolean,
	date,
	select,
	multiSelect,
	generateId,
} from './core/column-schemas';
export type {
	ColumnSchema,
	ColumnType,
	TableSchema,
	Id,
	DateWithTimezone,
	DateWithTimezoneString,
	DateIsoString,
	TimezoneId,
} from './core/column-schemas';

// Action helpers
export {
	defineQuery,
	defineMutation,
	isQuery,
	isMutation,
} from './core/actions';
export type {
	QueryAction,
	MutationAction,
	WorkspaceAction,
	InferActionInput,
	InferActionOutput,
} from './core/actions';

// Runtime
export { createWorkspaceClient } from './core/runtime';
export type { RuntimeConfig, WorkspaceClient } from './core/runtime';

// Database utilities
export { createEpicenterDb } from './db/core';
export { createEpicenterDbFromDisk } from './db/desktop';
export type { TableHelper, Db } from './db/core';

// Index system
export { defineIndex } from './core/indexes';
export type { Index, IndexContext, InferIndexes } from './core/indexes';

// Indexes (implementations)
export { sqliteIndex } from './indexes/sqlite-index';
export type { SQLiteIndexConfig } from './indexes/sqlite-index';

export { markdownIndex } from './indexes/markdown-index';
export type { MarkdownIndexConfig } from './indexes/markdown-index';

// Error types
export { IndexErr } from './core/errors';
export type { EpicenterOperationError, IndexError } from './core/errors';

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
