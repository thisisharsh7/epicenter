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
	CapabilityFactory,
	CapabilityFactoryMap,
	CapabilityContext,
	CapabilityExports,
	InferCapabilityExports,
} from './core/capability';
// Capability system
export { defineCapabilities } from './core/capability';
// Lifecycle protocol (shared by providers and capabilities)
export type { Lifecycle, MaybePromise } from './core/lifecycle';
export { defineExports, LifecycleExports } from './core/lifecycle';
export type {
	BooleanFieldSchema,
	CellValue,
	CoverDefinition,
	DateFieldSchema,
	DateIsoString,
	FieldSchema,
	FieldSchemaMap,
	FieldMetadata,
	FieldOptions,
	FieldType,
	Guid,
	IconDefinition,
	Id,
	IdFieldSchema,
	IntegerFieldSchema,
	JsonFieldSchema,
	KvDefinition,
	KvDefinitionMap,
	KvFieldSchema,
	KvValue,
	PartialRow,
	RealFieldSchema,
	RichtextFieldSchema,
	Row,
	SelectFieldSchema,
	TableDefinition,
	TableDefinitionMap,
	TagsFieldSchema,
	TextFieldSchema,
	TimezoneId,
} from './core/schema';
// Column schema system
export {
	boolean,
	cover,
	DATE_TIME_STRING_REGEX,
	date,
	DateTimeString,
	generateGuid,
	generateId,
	icon,
	id,
	integer,
	isNullableFieldSchema,
	ISO_DATETIME_REGEX,
	json,
	real,
	richtext,
	select,
	table,
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
export type { AbsolutePath, ProjectDir } from './core/types';
export type {
	Workspace,
	WorkspaceClient,
	WorkspaceDefinition,
} from './core/workspace/contract';
export { defineWorkspace } from './core/workspace/contract';

// Y.Doc wrappers for collaborative workspace architecture
export type {
	RegistryDoc,
	HeadDoc,
	ProviderContext,
	ProviderExports,
	ProviderFactory,
	ProviderFactoryMap,
	InferProviderExports,
} from './core/docs';
export { createRegistryDoc, createHeadDoc } from './core/docs';
// Action system
export type { Action, Actions, Mutation, Query } from './core/actions';
export {
	defineMutation,
	defineQuery,
	isAction,
	isMutation,
	isQuery,
	iterateActions,
} from './core/actions';

// Note: Capabilities (markdown, sqlite) are NOT re-exported here to avoid bundling
// Node.js-only code in browser builds. Import them directly from subpaths:
//   import { markdown } from '@epicenter/hq/capabilities/markdown';
//   import { sqlite } from '@epicenter/hq/capabilities/sqlite';
