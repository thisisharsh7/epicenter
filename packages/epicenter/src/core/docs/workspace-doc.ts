import * as Y from 'yjs';
import type {
	KvDefinitionMap,
	KvValue,
	TableDefinitionMap,
} from '../schema/fields/types';

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
// Workspace Doc Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the three top-level Y.Maps from a workspace Y.Doc.
 *
 * These are lazily created on first access (YJS behavior).
 *
 * @param ydoc - The workspace Y.Doc
 * @returns Object with schema, kv, and tables maps
 */
export function getWorkspaceDocMaps(ydoc: Y.Doc) {
	return {
		schema: ydoc.getMap(WORKSPACE_DOC_MAPS.SCHEMA) as SchemaMap,
		kv: ydoc.getMap(WORKSPACE_DOC_MAPS.KV) as KvMap,
		tables: ydoc.getMap(WORKSPACE_DOC_MAPS.TABLES) as TablesMap,
	};
}

/**
 * Merge table/KV schema into the Y.Map('schema').
 *
 * This is called during workspace creation to ensure the schema is stored
 * in the Y.Doc. Uses CRDT merge semantics so concurrent edits merge correctly.
 *
 * Note: Workspace identity (name, icon, description) is NOT stored here.
 * Use HeadDoc.setMeta() to set workspace identity.
 *
 * @param schemaMap - The Y.Map('schema') to write to
 * @param workspaceSchema - The schema to merge (tables and kv from defineWorkspace)
 */
export function mergeSchemaIntoYDoc<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(
	schemaMap: SchemaMap,
	workspaceSchema: {
		tables: TTableDefinitionMap;
		kv: TKvDefinitionMap;
	},
) {
	// Merge tables schema
	let tablesMap = schemaMap.get('tables') as Y.Map<unknown> | undefined;
	if (!tablesMap) {
		tablesMap = new Y.Map();
		schemaMap.set('tables', tablesMap);
	}

	for (const [tableName, tableDefinition] of Object.entries(
		workspaceSchema.tables,
	)) {
		let tableSchemaMap = tablesMap.get(tableName) as Y.Map<unknown> | undefined;
		if (!tableSchemaMap) {
			tableSchemaMap = new Y.Map();
			tablesMap.set(tableName, tableSchemaMap);
		}

		tableSchemaMap.set('name', tableDefinition.name);
		tableSchemaMap.set('icon', tableDefinition.icon ?? null);
		tableSchemaMap.set('description', tableDefinition.description ?? '');

		// Store fields as a nested Y.Map
		let fieldsMap = tableSchemaMap.get('fields') as Y.Map<unknown> | undefined;
		if (!fieldsMap) {
			fieldsMap = new Y.Map();
			tableSchemaMap.set('fields', fieldsMap);
		}

		for (const [fieldName, fieldSchema] of Object.entries(
			tableDefinition.fields,
		)) {
			// Store field schema as JSON (it's already JSON-serializable)
			fieldsMap.set(fieldName, fieldSchema);
		}
	}

	// Merge KV schema
	let kvSchemaMap = schemaMap.get('kv') as Y.Map<unknown> | undefined;
	if (!kvSchemaMap) {
		kvSchemaMap = new Y.Map();
		schemaMap.set('kv', kvSchemaMap);
	}

	for (const [keyName, kvDefinition] of Object.entries(workspaceSchema.kv)) {
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
}

/**
 * Read the schema from Y.Map('schema') as a plain object.
 *
 * Useful for introspection and migration.
 *
 * Note: Workspace identity (name, icon, description) is NOT returned here.
 * Use HeadDoc.getMeta() to read workspace identity.
 *
 * @param schemaMap - The Y.Map('schema') to read from
 * @returns The schema as a plain JSON object
 */
export function readSchemaFromYDoc(schemaMap: SchemaMap): WorkspaceSchemaMap {
	const tablesYMap = schemaMap.get('tables') as Y.Map<unknown> | undefined;
	const tables: WorkspaceSchemaMap['tables'] = {};

	if (tablesYMap) {
		for (const [tableName, tableSchemaYMap] of tablesYMap.entries()) {
			const tableMap = tableSchemaYMap as Y.Map<unknown>;
			const fieldsYMap = tableMap.get('fields') as Y.Map<unknown> | undefined;
			const fields: Record<string, unknown> = {};

			if (fieldsYMap) {
				for (const [fieldName, fieldSchema] of fieldsYMap.entries()) {
					fields[fieldName] = fieldSchema;
				}
			}

			tables[tableName] = {
				name: (tableMap.get('name') as string) ?? tableName,
				icon: (tableMap.get('icon') as IconDefinition | null) ?? null,
				description: (tableMap.get('description') as string) ?? '',
				fields,
			};
		}
	}

	const kvYMap = schemaMap.get('kv') as Y.Map<unknown> | undefined;
	const kv: WorkspaceSchemaMap['kv'] = {};

	if (kvYMap) {
		for (const [keyName, kvEntryYMap] of kvYMap.entries()) {
			const entryMap = kvEntryYMap as Y.Map<unknown>;
			kv[keyName] = {
				name: (entryMap.get('name') as string) ?? keyName,
				icon: (entryMap.get('icon') as IconDefinition | null) ?? null,
				description: (entryMap.get('description') as string) ?? '',
				field: entryMap.get('field'),
			};
		}
	}

	return { tables, kv };
}
