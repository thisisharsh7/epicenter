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
export type { Workspace, WorkspaceMethodContext } from './core/workspace';

// Column schema system
export {
	id,
	text,
	richText,
	integer,
	real,
	boolean,
	date,
	select,
	multiSelect,
	json,
	blob,
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

// Method helpers
export {
	defineQuery,
	defineMutation,
	isQuery,
	isMutation,
} from './core/methods';
export type {
	QueryMethod,
	MutationMethod,
	WorkspaceMethod,
	InferMethodInput,
	InferMethodOutput,
} from './core/methods';

// Runtime
export { runWorkspace } from './core/runtime';
export type { RuntimeConfig } from './core/runtime';

// YJS utilities
export type {
	YjsValue,
	YjsRowMap,
	YjsRowsById,
	YjsRowOrder,
	YjsTableMap,
	YjsTablesMap,
} from './core/yjsdoc';

// Index system
export type {
	Index,
	IndexContext,
	IndexesDefinition,
	CellValue,
	RowData,
} from './core/indexes';

// Indexes (implementations)
export { createSQLiteIndex } from './indexes/sqlite-index';
export type { SQLiteIndexConfig } from './indexes/sqlite-index';

export { createMarkdownIndex } from './indexes/markdown-index';
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
