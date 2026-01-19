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
 * - `definition`: Schema metadata (table/kv definitions, workspace name/icon)
 * - `kv`: Settings values (actual KV data)
 * - `tables`: Table data (rows organized by table name)
 *
 * This 1:1 mapping enables independent observation and different persistence
 * strategies per map.
 */
export const WORKSPACE_DOC_MAPS = {
	/** Schema and metadata. Rarely changes. Persisted to definition.json */
	DEFINITION: 'definition',
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
 * The structure stored in Y.Map('definition').
 *
 * Contains all schema/metadata for the workspace:
 * - Workspace display name and icon
 * - Table schemas (not data)
 * - KV schemas (not values)
 */
export type WorkspaceDefinitionMap = {
	/** Workspace display name */
	name: string;
	/** Workspace icon */
	icon: IconDefinition | null;
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

/** Y.Map storing workspace definition. */
export type DefinitionMap = Y.Map<unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Doc Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the three top-level Y.Maps from a workspace Y.Doc.
 *
 * These are lazily created on first access (YJS behavior).
 *
 * @param ydoc - The workspace Y.Doc
 * @returns Object with definition, kv, and tables maps
 */
export function getWorkspaceDocMaps(ydoc: Y.Doc) {
	return {
		definition: ydoc.getMap(WORKSPACE_DOC_MAPS.DEFINITION) as DefinitionMap,
		kv: ydoc.getMap(WORKSPACE_DOC_MAPS.KV) as KvMap,
		tables: ydoc.getMap(WORKSPACE_DOC_MAPS.TABLES) as TablesMap,
	};
}

/**
 * Merge a WorkspaceDefinition into the Y.Map('definition').
 *
 * This is called during workspace creation to ensure the schema is stored
 * in the Y.Doc. Uses CRDT merge semantics so concurrent edits merge correctly.
 *
 * @param definitionMap - The Y.Map('definition') to write to
 * @param workspaceDefinition - The definition to merge (from defineWorkspace)
 */
export function mergeDefinitionIntoYDoc<
	TTableDefinitionMap extends TableDefinitionMap,
	TKvDefinitionMap extends KvDefinitionMap,
>(
	definitionMap: DefinitionMap,
	workspaceDefinition: {
		name: string;
		tables: TTableDefinitionMap;
		kv: TKvDefinitionMap;
	},
) {
	// Set workspace-level metadata
	definitionMap.set('name', workspaceDefinition.name);

	// Icon defaults to null if not provided
	if (!definitionMap.has('icon')) {
		definitionMap.set('icon', null);
	}

	// Merge tables schema
	let tablesMap = definitionMap.get('tables') as Y.Map<unknown> | undefined;
	if (!tablesMap) {
		tablesMap = new Y.Map();
		definitionMap.set('tables', tablesMap);
	}

	for (const [tableName, tableDefinition] of Object.entries(
		workspaceDefinition.tables,
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
	let kvSchemaMap = definitionMap.get('kv') as Y.Map<unknown> | undefined;
	if (!kvSchemaMap) {
		kvSchemaMap = new Y.Map();
		definitionMap.set('kv', kvSchemaMap);
	}

	for (const [keyName, kvDefinition] of Object.entries(
		workspaceDefinition.kv,
	)) {
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
 * Read the definition from Y.Map('definition') as a plain object.
 *
 * Useful for persisting to definition.json or for introspection.
 *
 * @param definitionMap - The Y.Map('definition') to read from
 * @returns The definition as a plain JSON object
 */
export function readDefinitionFromYDoc(
	definitionMap: DefinitionMap,
): WorkspaceDefinitionMap {
	const name = (definitionMap.get('name') as string) ?? '';
	const icon = (definitionMap.get('icon') as IconDefinition | null) ?? null;

	const tablesYMap = definitionMap.get('tables') as Y.Map<unknown> | undefined;
	const tables: WorkspaceDefinitionMap['tables'] = {};

	if (tablesYMap) {
		for (const [tableName, tableSchemaYMap] of tablesYMap.entries()) {
			const schemaMap = tableSchemaYMap as Y.Map<unknown>;
			const fieldsYMap = schemaMap.get('fields') as Y.Map<unknown> | undefined;
			const fields: Record<string, unknown> = {};

			if (fieldsYMap) {
				for (const [fieldName, fieldSchema] of fieldsYMap.entries()) {
					fields[fieldName] = fieldSchema;
				}
			}

			tables[tableName] = {
				name: (schemaMap.get('name') as string) ?? tableName,
				icon: (schemaMap.get('icon') as IconDefinition | null) ?? null,
				description: (schemaMap.get('description') as string) ?? '',
				fields,
			};
		}
	}

	const kvYMap = definitionMap.get('kv') as Y.Map<unknown> | undefined;
	const kv: WorkspaceDefinitionMap['kv'] = {};

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

	return { name, icon, tables, kv };
}
