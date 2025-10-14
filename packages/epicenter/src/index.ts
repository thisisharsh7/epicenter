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
} from './core/schema';
export type {
	ColumnSchema,
	ColumnType,
	TableSchema,
	ValidatedRow,
	Id,
	DateWithTimezone,
} from './core/schema';

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
export { createWorkspaceClient } from './core/workspace';
export type { RuntimeConfig, WorkspaceClient } from './core/workspace';

// Epicenter - compose multiple workspaces
export { defineEpicenter, createEpicenterClient } from './core/epicenter';
export type { EpicenterConfig, EpicenterClient } from './core/epicenter';

// Database utilities
export { createEpicenterDb } from './db/core';
export { createEpicenterDbFromDisk } from './db/desktop';
export type { TableHelper, Db } from './db/core';

// Index system
export { defineIndex } from './core/indexes';
export type { Index, IndexContext, WorkspaceIndexMap } from './core/indexes';

// Indexes (implementations)
export { sqliteIndex } from './indexes/sqlite';
export type { SQLiteIndexConfig } from './indexes/sqlite';

export { markdownIndex } from './indexes/markdown';
export type { MarkdownIndexConfig } from './indexes/markdown';

// Error types
export { IndexErr } from './core/errors';
export type { EpicenterOperationError, IndexError } from './core/errors';

// Schema adapters - generate Zod/ArkType schemas from table schemas
export {
	createInsertSchema as createInsertSchemaZod,
	createSelectSchema as createSelectSchemaZod,
	createUpdateSchema as createUpdateSchemaZod,
} from './adapters/zod';

export {
	createInsertSchema as createInsertSchemaArkType,
	createSelectSchema as createSelectSchemaArkType,
	createUpdateSchema as createUpdateSchemaArkType,
} from './adapters/arktype';

// Server - expose workspaces as REST API and MCP servers
export { createEpicenterServer, createWorkspaceServer } from './server';
export type {
	MCPTool,
	MCPToolsListResponse,
	MCPToolCallRequest,
	MCPToolCallResponse,
} from './server';

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
