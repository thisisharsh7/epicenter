import * as Y from 'yjs';
import { createKv, type Kv } from '../kv/core';
import type {
	KvDefinitionMap,
	KvValue,
	TableDefinitionMap,
} from '../schema/fields/types';
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
// Workspace Doc Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Workspace Y.Doc wrapper for managing workspace data.
 *
 * Each workspace epoch has one Workspace Y.Doc containing schema definitions
 * and data (tables + kv values). This wrapper provides typed accessors for
 * the three top-level Y.Maps, plus typed table and kv helpers.
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
 * @example
 * ```typescript
 * const workspaceDoc = createWorkspaceDoc({
 *   workspaceId: 'abc123',
 *   epoch: 0,
 *   tableDefinitions: { posts: table({ name: 'Posts', fields: { id: id(), title: text() } }) },
 *   kvDefinitions: {},
 * });
 *
 * // Use typed table helpers directly
 * workspaceDoc.tables.posts.upsert({ id: '1', title: 'Hello' });
 *
 * // Access schema
 * const schema = workspaceDoc.getSchema();
 *
 * // Merge code-defined schema into Y.Doc
 * workspaceDoc.mergeSchema({ tables: {...}, kv: {} });
 *
 * // Observe schema changes
 * const unsubscribe = workspaceDoc.observeSchema((schema) => {
 *   console.log('Schema changed:', schema);
 * });
 *
 * // Get raw maps for low-level operations
 * const schemaMap = workspaceDoc.getSchemaMap();
 * const kvMap = workspaceDoc.getKvMap();
 * const tablesMap = workspaceDoc.getTablesMap();
 * ```
 */
export function createWorkspaceDoc<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(options: {
	workspaceId: string;
	epoch: number;
	tableDefinitions: TTableDefinitionMap;
	kvDefinitions: TKvDefinitionMap;
}) {
	const { workspaceId, epoch, tableDefinitions, kvDefinitions } = options;
	const docId = `${workspaceId}:${epoch}`;
	// gc: false is required for revision history snapshots to work
	const ydoc = new Y.Doc({ guid: docId, gc: false });

	// Get maps once, keep in closure
	const schemaMap = ydoc.getMap(WORKSPACE_DOC_MAPS.SCHEMA) as SchemaMap;
	const kvMap = ydoc.getMap(WORKSPACE_DOC_MAPS.KV) as KvMap;
	const tablesMap = ydoc.getMap(WORKSPACE_DOC_MAPS.TABLES) as TablesMap;

	// Create table and kv helpers bound to the Y.Doc
	// These just bind to Y.Maps - actual data comes from persistence
	const tables = createTables(ydoc, tableDefinitions);
	const kv = createKv(ydoc, kvDefinitions);

	return {
		/** The underlying Y.Doc instance. */
		ydoc,

		/** The workspace ID (without epoch suffix). */
		workspaceId,

		/** The epoch number for this workspace doc. */
		epoch,

		/** Typed table helpers for CRUD operations. */
		tables,

		/** Key-value store for simple values. */
		kv,

		/**
		 * Get the schema Y.Map for low-level operations.
		 *
		 * Prefer `getSchema()` for reading and `mergeSchema()` for writing
		 * unless you need direct Y.Map access for observation or custom logic.
		 */
		getSchemaMap() {
			return schemaMap;
		},

		/**
		 * Get the KV Y.Map for low-level operations.
		 *
		 * This contains the actual KV values, not the KV schema definitions.
		 */
		getKvMap() {
			return kvMap;
		},

		/**
		 * Get the tables Y.Map for low-level operations.
		 *
		 * Structure: `Y.Map<tableName, Y.Map<rowId, Y.Map<fieldName, value>>>`
		 */
		getTablesMap() {
			return tablesMap;
		},

		/**
		 * Read the current schema from the Y.Doc as a plain object.
		 *
		 * Returns table and KV schema definitions (NOT workspace identity).
		 * Use `head.name`, `head.icon`, `head.description` for workspace identity.
		 *
		 * @example
		 * ```typescript
		 * const schema = workspaceDoc.getSchema();
		 * console.log(schema.tables.posts);  // { name: 'Posts', fields: {...} }
		 * ```
		 */
		getSchema(): WorkspaceSchemaMap {
			return schemaMap.toJSON() as WorkspaceSchemaMap;
		},

		/**
		 * Merge table/KV schema into the Y.Doc.
		 *
		 * Uses CRDT merge semantics so concurrent edits merge correctly.
		 * Call this after persistence loads to ensure code-defined schema
		 * is "last writer" and overrides stale disk values.
		 *
		 * @param schema - The schema to merge (tables and kv)
		 *
		 * @example
		 * ```typescript
		 * workspaceDoc.mergeSchema({
		 *   tables: { posts: table({ name: 'Posts', fields: { id: id(), title: text() } }) },
		 *   kv: {},
		 * });
		 * ```
		 */
		mergeSchema<
			TTableDefinitionMap extends TableDefinitionMap,
			TKvDefinitionMap extends KvDefinitionMap,
		>(schema: { tables: TTableDefinitionMap; kv: TKvDefinitionMap }) {
			// Merge tables schema
			let tablesYMap = schemaMap.get('tables') as Y.Map<unknown> | undefined;
			if (!tablesYMap) {
				tablesYMap = new Y.Map();
				schemaMap.set('tables', tablesYMap);
			}

			for (const [tableName, tableDefinition] of Object.entries(
				schema.tables,
			)) {
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
		},

		/**
		 * Observe schema changes.
		 *
		 * Fires when any part of the schema (tables or kv definitions) changes.
		 * Useful for UI that needs to react to collaborative schema edits.
		 *
		 * @param callback - Function called with the new schema when it changes
		 * @returns Unsubscribe function
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = workspaceDoc.observeSchema((schema) => {
		 *   console.log('Schema updated:', schema.tables);
		 *   // Re-render table list, etc.
		 * });
		 *
		 * // Later: stop observing
		 * unsubscribe();
		 * ```
		 */
		observeSchema(callback: (schema: WorkspaceSchemaMap) => void) {
			const handler = () => {
				callback(this.getSchema());
			};

			schemaMap.observeDeep(handler);
			return () => schemaMap.unobserveDeep(handler);
		},
	};
}

/**
 * Workspace Y.Doc wrapper type with typed tables and kv.
 *
 * Use the generic parameters to get proper typing for table/kv access:
 *
 * @example
 * ```typescript
 * type MyWorkspaceDoc = WorkspaceDoc<typeof myTableDefs, typeof myKvDefs>;
 * ```
 */
export type WorkspaceDoc<
	TTableDefinitionMap extends TableDefinitionMap = TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap = KvDefinitionMap,
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
	/** Get the schema Y.Map for low-level operations. */
	getSchemaMap(): SchemaMap;
	/** Get the KV Y.Map for low-level operations. */
	getKvMap(): KvMap;
	/** Get the tables Y.Map for low-level operations. */
	getTablesMap(): TablesMap;
	/** Read the current schema from the Y.Doc as a plain object. */
	getSchema(): WorkspaceSchemaMap;
	/** Merge table/KV schema into the Y.Doc. */
	mergeSchema<
		TMergeTables extends TableDefinitionMap,
		TMergeKv extends KvDefinitionMap,
	>(schema: { tables: TMergeTables; kv: TMergeKv }): void;
	/** Observe schema changes. */
	observeSchema(callback: (schema: WorkspaceSchemaMap) => void): () => void;
};
