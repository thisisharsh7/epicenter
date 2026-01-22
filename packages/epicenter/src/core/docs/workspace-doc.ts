import * as Y from 'yjs';
import { createKv, type Kv } from '../kv/core';
import { defineExports, type Lifecycle } from '../lifecycle';
import type {
	KvDefinitionMap,
	KvValue,
	TableDefinitionMap,
} from '../schema/fields/types';
import { createSchema, type Schema } from '../schema-helper';
import { createTables, type Tables } from '../tables/create-tables';

// ─────────────────────────────────────────────────────────────────────────────
// Y.Doc Top-Level Map Names
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three top-level Y.Map names in a Workspace Y.Doc.
 *
 * Each workspace epoch has a single Y.Doc with three top-level maps:
 * - `schema`: Table/KV definitions (field schemas, table metadata)
 * - `kv`: Settings values (actual KV data)
 * - `tables`: Table data (rows organized by table name)
 *
 * Note: Workspace-level identity (name, icon, description) lives in the
 * Head Doc's `meta` map, NOT here. This ensures renaming applies to all epochs.
 *
 * This 1:1 mapping enables independent observation and different persistence
 * strategies per map.
 */
export const WORKSPACE_DOC_MAPS = {
	/** Table/KV schema definitions. Rarely changes. */
	SCHEMA: 'schema',
	/** Settings values. Changes occasionally. Persisted to kv.json */
	KV: 'kv',
	/** Table row data. Changes frequently. Persisted to tables.sqlite */
	TABLES: 'tables',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Type Definitions for Y.Doc Structure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Icon definition for workspaces, tables, and KV entries.
 */
export type IconDefinition =
	| { type: 'emoji'; value: string }
	| { type: 'lucide'; value: string }
	| { type: 'url'; value: string };

/**
 * The structure stored in Y.Map('schema') in the Workspace Doc.
 *
 * Contains table and KV schema definitions (NOT workspace identity).
 * Workspace identity (name, icon, description) lives in the Head Doc's `meta` map.
 *
 * @see WorkspaceMeta in head-doc.ts for workspace identity
 */
export type WorkspaceSchemaMap = {
	/** Table schemas (name, icon, description, fields) */
	tables: {
		[tableName: string]: {
			name: string;
			icon: IconDefinition | null;
			description: string;
			fields: Record<string, unknown>; // FieldSchema objects
		};
	};
	/** KV schemas (name, icon, description, field) */
	kv: {
		[key: string]: {
			name: string;
			icon: IconDefinition | null;
			description: string;
			field: unknown; // FieldSchema object
		};
	};
};

// ─────────────────────────────────────────────────────────────────────────────
// Y.Map Type Aliases
// ─────────────────────────────────────────────────────────────────────────────

/** Y.Map storing cell values for a single row, keyed by column name. */
export type RowMap = Y.Map<unknown>;

/** Y.Map storing rows for a single table, keyed by row ID. */
export type TableMap = Y.Map<RowMap>;

/** Y.Map storing all tables, keyed by table name. */
export type TablesMap = Y.Map<TableMap>;

/** Y.Map storing KV values, keyed by key name. */
export type KvMap = Y.Map<KvValue>;

/** Y.Map storing workspace schema (tables and kv definitions). */
export type SchemaMap = Y.Map<unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Extension Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extension exports - returned values accessible via `workspace.extensions.{name}`.
 *
 * This type combines the lifecycle protocol with custom exports.
 * The framework guarantees `whenSynced` and `destroy` exist on all extensions.
 */
export type ExtensionExports<T extends Record<string, unknown> = {}> =
	Lifecycle & T;

/**
 * An extension factory function that attaches functionality to a workspace.
 *
 * Receives a flattened context with all workspace data directly accessible.
 * Factories are **always synchronous**. Async initialization is tracked via
 * the returned `whenSynced` promise.
 */
export type ExtensionFactory<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TExports extends ExtensionExports = ExtensionExports,
> = (
	context: ExtensionContext<TTableDefinitionMap, TKvDefinitionMap>,
) => TExports;

/**
 * A map of extension factory functions keyed by extension ID.
 */
export type ExtensionFactoryMap<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = Record<string, ExtensionFactory<TTableDefinitionMap, TKvDefinitionMap>>;

/**
 * Utility type to infer exports from an extension factory map.
 */
export type InferExtensionExports<TExtensionFactories> = {
	[K in keyof TExtensionFactories]: TExtensionFactories[K] extends ExtensionFactory<
		TableDefinitionMap,
		KvDefinitionMap,
		infer TExports
	>
		? TExports extends ExtensionExports
			? TExports
			: ExtensionExports
		: ExtensionExports;
};

// ─────────────────────────────────────────────────────────────────────────────
// Extension Context Type (flattened)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context provided to each extension function.
 *
 * This is a flattened view of the workspace doc plus the extension's ID.
 * Extensions can destructure exactly what they need without nesting.
 *
 * @example
 * ```typescript
 * // Destructure only what you need
 * const persistence: ExtensionFactory = ({ ydoc }) => { ... };
 * const sqlite: ExtensionFactory = ({ workspaceId, tables }) => { ... };
 * const markdown: ExtensionFactory = ({ ydoc, tables, workspaceId }) => { ... };
 * ```
 */
export type ExtensionContext<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
> = {
	/** The underlying Y.Doc instance. */
	ydoc: Y.Doc;
	/** The workspace ID (without epoch suffix). */
	workspaceId: string;
	/** The epoch number for this workspace doc. */
	epoch: number;
	/** Typed table helpers for CRUD operations. */
	tables: Tables<TTableDefinitionMap>;
	/** Key-value store for simple values. */
	kv: Kv<TKvDefinitionMap>;
	/**
	 * Schema helper for managing table and KV schemas.
	 *
	 * Provides typed CRUD operations for dynamic schema editing (Notion-like UIs).
	 *
	 * @example
	 * ```typescript
	 * // Add a column to a table
	 * schema.tables.table('posts')?.fields.set('dueDate', date());
	 *
	 * // Update table metadata
	 * schema.tables.table('posts')?.metadata.set({ name: 'Blog Posts' });
	 *
	 * // Add a KV setting
	 * schema.kv.set('theme', { name: 'Theme', field: select({ options: ['light', 'dark'] }) });
	 * ```
	 */
	schema: Schema;
	/**
	 * The schema Y.Map for low-level operations. Stable reference.
	 * @deprecated Use `schema.$raw` instead.
	 */
	schemaMap: SchemaMap;
	/**
	 * The KV Y.Map for low-level operations. Stable reference.
	 * @deprecated Use `kv.$raw` instead.
	 */
	kvMap: KvMap;
	/**
	 * The tables Y.Map for low-level operations. Stable reference.
	 * @deprecated Use `tables.$raw` instead.
	 */
	tablesMap: TablesMap;
	/**
	 * Read the current schema from the Y.Doc as a plain object (snapshot).
	 * @deprecated Use `schema.get()` instead.
	 */
	getSchema(): WorkspaceSchemaMap;
	/**
	 * Merge table/KV schema into the Y.Doc.
	 * @deprecated Use `schema.merge()` instead.
	 */
	mergeSchema<
		TMergeTables extends TableDefinitionMap,
		TMergeKv extends KvDefinitionMap,
	>(schema: { tables: TMergeTables; kv: TMergeKv }): void;
	/**
	 * Observe schema changes.
	 * @deprecated Use `schema.observe()` instead.
	 */
	observeSchema(callback: (schema: WorkspaceSchemaMap) => void): () => void;
	/** This extension's key from `.withExtensions({ key: ... })`. */
	extensionId: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Doc Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Workspace Y.Doc with typed accessors, extensions, and lifecycle management.
 *
 * This is the primary abstraction for working with workspaces. It combines:
 * - Y.Doc wrapper with typed table and kv helpers
 * - Extension initialization and lifecycle management
 * - Schema merge and observation capabilities
 *
 * Y.Doc ID: `{workspaceId}:{epoch}`
 *
 * ## Structure
 *
 * ```
 * Y.Map('schema')  - Table/KV definitions (rarely changes)
 * Y.Map('kv')      - Settings values (changes occasionally)
 * Y.Map('tables')  - Row data by table name (changes frequently)
 * ```
 *
 * ## Schema Merging
 *
 * After all extensions sync (e.g., persistence loads from disk), the provided
 * `tables` and `kv` definitions are automatically merged into the Y.Doc's schema map.
 * This ensures code-defined schema is the "last writer" over persisted state.
 *
 * For dynamic schema mode (no code-defined schema), pass empty objects `{}` for
 * both `tables` and `kv`.
 *
 * @example
 * ```typescript
 * const workspace = createWorkspaceDoc({
 *   workspaceId: 'blog',
 *   epoch: 0,
 *   tables: { posts: table({ name: 'Posts', fields: { id: id(), title: text() } }) },
 *   kv: {},
 *   extensionFactories: {
 *     persistence: ({ ydoc }) => persistence({ ydoc }, { filePath: './data.yjs' }),
 *     sqlite: ({ workspaceId, tables }) => sqlite({ workspaceId, tables }, { dbPath: './data.db' }),
 *   },
 * });
 *
 * // Wait for extensions to sync (schema is merged automatically)
 * await workspace.whenSynced;
 *
 * // Use typed table helpers
 * workspace.tables.posts.upsert({ id: '1', title: 'Hello' });
 *
 * // Access extension exports
 * workspace.extensions.sqlite.db.select().from(...);
 *
 * // Cleanup
 * await workspace.destroy();
 * ```
 */
export function createWorkspaceDoc<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
	TExtensionFactories extends ExtensionFactoryMap<
		TTableDefinitionMap,
		TKvDefinitionMap
	>,
>({
	workspaceId,
	epoch,
	tables: tableDefinitions,
	kv: kvDefinitions,
	extensionFactories,
}: {
	workspaceId: string;
	epoch: number;
	tables: TTableDefinitionMap;
	kv: TKvDefinitionMap;
	extensionFactories: TExtensionFactories;
}): WorkspaceDoc<
	TTableDefinitionMap,
	TKvDefinitionMap,
	InferExtensionExports<TExtensionFactories>
> {
	const docId = `${workspaceId}:${epoch}`;
	// gc: false is required for revision history snapshots to work
	const ydoc = new Y.Doc({ guid: docId, gc: false });

	// Get maps once, keep in closure. Y.Doc.getMap() returns the same reference
	// on repeated calls, but we cache them to avoid repeated string lookups.
	const schemaMap = ydoc.getMap(WORKSPACE_DOC_MAPS.SCHEMA) as SchemaMap;
	const kvMap = ydoc.getMap(WORKSPACE_DOC_MAPS.KV) as KvMap;
	const tablesMap = ydoc.getMap(WORKSPACE_DOC_MAPS.TABLES) as TablesMap;

	// Create table and kv helpers bound to the Y.Doc
	// These just bind to Y.Maps - actual data comes from persistence
	const tables = createTables(ydoc, tableDefinitions);
	const kv = createKv(ydoc, kvDefinitions);
	const schema = createSchema(schemaMap);

	const getSchema = (): WorkspaceSchemaMap => {
		return schemaMap.toJSON() as WorkspaceSchemaMap;
	};

	const mergeSchema = <
		TMergeTables extends TableDefinitionMap,
		TMergeKv extends KvDefinitionMap,
	>(schema: {
		tables: TMergeTables;
		kv: TMergeKv;
	}) => {
		// Merge tables schema
		let tablesYMap = schemaMap.get('tables') as Y.Map<unknown> | undefined;
		if (!tablesYMap) {
			tablesYMap = new Y.Map();
			schemaMap.set('tables', tablesYMap);
		}

		for (const [tableName, tableDefinition] of Object.entries(schema.tables)) {
			let tableSchemaMap = tablesYMap.get(tableName) as
				| Y.Map<unknown>
				| undefined;
			if (!tableSchemaMap) {
				tableSchemaMap = new Y.Map();
				tablesYMap.set(tableName, tableSchemaMap);
			}

			tableSchemaMap.set('name', tableDefinition.name);
			tableSchemaMap.set('icon', tableDefinition.icon ?? null);
			tableSchemaMap.set('description', tableDefinition.description ?? '');

			// Store fields as a nested Y.Map
			let fieldsMap = tableSchemaMap.get('fields') as
				| Y.Map<unknown>
				| undefined;
			if (!fieldsMap) {
				fieldsMap = new Y.Map();
				tableSchemaMap.set('fields', fieldsMap);
			}

			for (const [fieldName, fieldSchema] of Object.entries(
				tableDefinition.fields,
			)) {
				fieldsMap.set(fieldName, fieldSchema);
			}
		}

		// Merge KV schema
		let kvSchemaMap = schemaMap.get('kv') as Y.Map<unknown> | undefined;
		if (!kvSchemaMap) {
			kvSchemaMap = new Y.Map();
			schemaMap.set('kv', kvSchemaMap);
		}

		for (const [keyName, kvDefinition] of Object.entries(schema.kv)) {
			let kvEntryMap = kvSchemaMap.get(keyName) as Y.Map<unknown> | undefined;
			if (!kvEntryMap) {
				kvEntryMap = new Y.Map();
				kvSchemaMap.set(keyName, kvEntryMap);
			}

			kvEntryMap.set('name', kvDefinition.name);
			kvEntryMap.set('icon', kvDefinition.icon ?? null);
			kvEntryMap.set('description', kvDefinition.description ?? '');
			kvEntryMap.set('field', kvDefinition.field);
		}
	};

	const observeSchema = (callback: (schema: WorkspaceSchemaMap) => void) => {
		const handler = () => {
			callback(getSchema());
		};
		schemaMap.observeDeep(handler);
		return () => schemaMap.unobserveDeep(handler);
	};

	// ─────────────────────────────────────────────────────────────────────────
	// Extension Initialization
	// ─────────────────────────────────────────────────────────────────────────

	// Initialize extensions synchronously — async work is in their whenSynced
	const extensions = {} as InferExtensionExports<TExtensionFactories>;
	for (const [extensionId, extensionFactory] of Object.entries(
		extensionFactories,
	)) {
		// Build flattened context for this extension
		const context: ExtensionContext<TTableDefinitionMap, TKvDefinitionMap> = {
			ydoc,
			workspaceId,
			epoch,
			tables,
			kv,
			schema,
			// Deprecated - kept for backward compatibility
			schemaMap,
			kvMap,
			tablesMap,
			getSchema,
			mergeSchema,
			observeSchema,
			extensionId,
		};

		// Factory is sync; normalize exports at boundary
		const result = extensionFactory(context);
		const exports = defineExports(result as Record<string, unknown>);
		(extensions as Record<string, unknown>)[extensionId] = exports;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Lifecycle Management
	// ─────────────────────────────────────────────────────────────────────────

	// Aggregate all extension whenSynced promises
	// Fail-fast: any rejection rejects the whole thing (UI shows error state)
	//
	// ORDER OF OPERATIONS (critical for correctness):
	// 1. Wait for all extensions' whenSynced (e.g., persistence finishes loading disk state)
	// 2. THEN merge schema (code-defined schema is "last writer")
	// 3. Resolve whenSynced
	//
	// See: specs/20260119T231252-resilient-client-architecture.md
	const whenSynced = Promise.all(
		Object.values(extensions).map((e) => (e as Lifecycle).whenSynced),
	).then(() => {
		// After persistence has loaded disk state, merge the code-defined schema.
		// This ensures code is "last writer" over any persisted schema.
		// For dynamic schema mode (empty tables/kv), this is a no-op.
		const hasSchema =
			Object.keys(tableDefinitions).length > 0 ||
			Object.keys(kvDefinitions).length > 0;
		if (hasSchema) {
			mergeSchema({ tables: tableDefinitions, kv: kvDefinitions });
		}
	});

	const destroy = async () => {
		// Use allSettled so one destroy failure doesn't block others
		await Promise.allSettled(
			Object.values(extensions).map((e) => (e as Lifecycle).destroy()),
		);
		// Always release doc resources
		ydoc.destroy();
	};

	return {
		ydoc,
		workspaceId,
		epoch,
		tables,
		kv,
		schema,
		extensions,
		// Deprecated - kept for backward compatibility
		schemaMap,
		kvMap,
		tablesMap,
		getSchema,
		mergeSchema,
		observeSchema,
		whenSynced,
		destroy,
		[Symbol.asyncDispose]: destroy,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceDoc Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The unified workspace abstraction with typed tables, kv, extensions, and lifecycle.
 *
 * This is the return type of `createWorkspaceDoc()` and `createClient()`.
 * It combines Y.Doc wrapper, typed accessors, extension exports, and lifecycle management.
 *
 * @example
 * ```typescript
 * const workspace: WorkspaceDoc<MyTables, MyKv, MyExtensions> = createClient('blog')
 *   .withSchema(schema)
 *   .withExtensions({ persistence, sqlite });
 *
 * await workspace.whenSynced;
 * workspace.tables.posts.upsert({ id: '1', title: 'Hello' });
 * workspace.extensions.sqlite.db.select()...;
 * await workspace.destroy();
 * ```
 */
export type WorkspaceDoc<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
	TExtensions extends Record<string, ExtensionExports> = Record<
		string,
		ExtensionExports
	>,
> = {
	/** The underlying Y.Doc instance. */
	ydoc: Y.Doc;
	/** The workspace ID (without epoch suffix). */
	workspaceId: string;
	/** The epoch number for this workspace doc. */
	epoch: number;
	/** Typed table helpers for CRUD operations. */
	tables: Tables<TTableDefinitionMap>;
	/** Key-value store for simple values. */
	kv: Kv<TKvDefinitionMap>;
	/** Schema helper for managing table and KV schemas. */
	schema: Schema;
	/** Extension exports keyed by extension ID. */
	extensions: TExtensions;
	/**
	 * The schema Y.Map for low-level operations. Stable reference.
	 * @deprecated Use `schema.$raw` instead.
	 */
	schemaMap: SchemaMap;
	/**
	 * The KV Y.Map for low-level operations. Stable reference.
	 * @deprecated Use `kv.$raw` instead.
	 */
	kvMap: KvMap;
	/**
	 * The tables Y.Map for low-level operations. Stable reference.
	 * @deprecated Use `tables.$raw` instead.
	 */
	tablesMap: TablesMap;
	/**
	 * Read the current schema from the Y.Doc as a plain object (snapshot).
	 * @deprecated Use `schema.get()` instead.
	 */
	getSchema(): WorkspaceSchemaMap;
	/**
	 * Merge table/KV schema into the Y.Doc.
	 * @deprecated Use `schema.merge()` instead.
	 */
	mergeSchema<
		TMergeTables extends TableDefinitionMap,
		TMergeKv extends KvDefinitionMap,
	>(schema: { tables: TMergeTables; kv: TMergeKv }): void;
	/**
	 * Observe schema changes.
	 * @deprecated Use `schema.observe()` instead.
	 */
	observeSchema(callback: (schema: WorkspaceSchemaMap) => void): () => void;
	/** Promise that resolves when all extensions have synced. */
	whenSynced: Promise<void>;
	/** Clean up all extensions and release Y.Doc resources. */
	destroy(): Promise<void>;
	/** Async disposable for `await using` syntax. */
	[Symbol.asyncDispose]: () => Promise<void>;
};
