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
export type {
	CapabilityContext,
	CapabilityExports,
	CapabilityFactory,
	CapabilityFactoryMap,
	InferCapabilityExports,
} from './core/capability';
// Capability system
export { defineCapabilities } from './core/capability';
// Y.Doc wrappers for collaborative workspace architecture
export type {
	HeadDoc,
	InferProviderExports,
	ProviderContext,
	ProviderExports,
	ProviderFactory,
	ProviderFactoryMap,
	RegistryDoc,
} from './core/docs';
export { createHeadDoc, createRegistryDoc } from './core/docs';
export type { CapabilityError } from './core/errors';
// Error types
export { CapabilityErr } from './core/errors';
export type { Kv, KvHelper } from './core/kv/core';
export { createKv } from './core/kv/core';
// Lifecycle protocol (shared by providers and capabilities)
export type { Lifecycle, MaybePromise } from './core/lifecycle';
export { defineExports, LifecycleExports } from './core/lifecycle';
// Rich content ID generation
export type { RichContentId } from './core/rich-content/id';
export { createRichContentId } from './core/rich-content/id';
export type {
	BooleanFieldSchema,
	CellValue,
	CoverDefinition,
	DateFieldSchema,
	FieldMetadata,
	FieldOptions,
	FieldSchema,
	FieldSchemaMap,
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
	KvSchemaMap,
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
	DateTimeString,
	date,
	generateGuid,
	generateId,
	ISO_DATETIME_REGEX,
	icon,
	id,
	integer,
	isNullableFieldSchema,
	json,
	real,
	richtext,
	select,
	TIMEZONE_ID_REGEX,
	table,
	tableSchemaToArktype,
	tableSchemaToYjsArktype,
	tags,
	text,
	toSqlIdentifier,
} from './core/schema';
export type { TableHelper, Tables } from './core/tables/create-tables';
// Table utilities
export { createTables } from './core/tables/create-tables';
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
// Core types
export type { AbsolutePath, ProjectDir } from './core/types';
// Workspace normalization helpers
export {
	DEFAULT_KV_ICON,
	isKvDefinition,
	isTableDefinition,
	normalizeIcon,
	normalizeKv,
} from './core/workspace/normalize';
export type {
	NormalizedKv,
	Workspace,
	WorkspaceClient,
	WorkspaceDefinition,
	WorkspaceInput,
} from './core/workspace/workspace';
export { createClient, defineWorkspace } from './core/workspace/workspace';

// Note: Capabilities (markdown, sqlite) are NOT re-exported here to avoid bundling
// Node.js-only code in browser builds. Import them directly from subpaths:
//   import { markdown } from '@epicenter/hq/capabilities/markdown';
//   import { sqlite } from '@epicenter/hq/capabilities/sqlite';
