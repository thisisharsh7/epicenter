import * as Y from 'yjs';

import type { KvSchema, TablesSchema } from '../schema';
import type {
	FieldSchema,
	FieldType,
	IconDefinition,
	JsonFieldSchema,
} from '../schema/fields/types';
import { standardSchemaToJsonSchema } from '../schema/standard/to-json-schema';

/**
 * Stored field schema in Y.Doc.
 *
 * Contains all FieldSchema properties, with json fields having their
 * StandardSchema converted to JSON Schema for serialization.
 *
 * This enables collaborative schema editing - users can modify field names,
 * descriptions, and icons, and changes sync via CRDT.
 */
export type StoredFieldSchema = {
	/** Field type discriminant */
	type: FieldType;
	/** Display name shown in UI */
	name: string;
	/** Description shown in tooltips/docs */
	description: string;
	/** Icon for the field */
	icon: IconDefinition | null;
	/** Whether the field is nullable (not present on id/richtext) */
	nullable?: boolean;
	/** Default value */
	default?: unknown;
	/** Options for select/tags fields */
	options?: readonly string[];
	/** JSON Schema for json fields (converted from StandardSchema) */
	schema?: unknown;
};

/**
 * Prepare a FieldSchema for Y.Doc storage.
 *
 * For json fields, converts the StandardSchema to JSON Schema.
 * All other fields are stored as-is, preserving metadata (name, description, icon).
 */
function prepareForStorage(schema: FieldSchema): StoredFieldSchema {
	if (schema.type === 'json') {
		const jsonField = schema as JsonFieldSchema;
		return {
			...jsonField,
			schema: standardSchemaToJsonSchema(jsonField.schema),
		} as StoredFieldSchema;
	}
	return schema as StoredFieldSchema;
}

/**
 * Deep equality check for stored field schemas.
 *
 * Compares all properties including metadata (name, description, icon).
 */
function deepEqual(a: StoredFieldSchema, b: StoredFieldSchema): boolean {
	// Type must match
	if (a.type !== b.type) return false;

	// Compare common optional properties
	if (a.nullable !== b.nullable) return false;
	if (a.default !== b.default) return false;
	if (a.name !== b.name) return false;
	if (a.description !== b.description) return false;

	// Compare icon (can be null or object)
	if (a.icon !== b.icon) {
		if (!a.icon || !b.icon) return false;
		if (a.icon.type !== b.icon.type) return false;
		if (a.icon.type === 'emoji' && b.icon.type === 'emoji') {
			if (a.icon.value !== b.icon.value) return false;
		} else if (a.icon.type === 'external' && b.icon.type === 'external') {
			if (a.icon.url !== b.icon.url) return false;
		}
	}

	// Compare options array (for select/tags)
	const aOpts = a.options;
	const bOpts = b.options;
	if (aOpts !== bOpts) {
		if (!aOpts || !bOpts) return false;
		if (aOpts.length !== bOpts.length) return false;
		for (let i = 0; i < aOpts.length; i++) {
			if (aOpts[i] !== bOpts[i]) return false;
		}
	}

	// Compare schema (for json fields - compare as JSON strings)
	if (JSON.stringify(a.schema) !== JSON.stringify(b.schema)) return false;

	return true;
}

/**
 * Create a Data Y.Doc wrapper for managing workspace data and schema.
 *
 * Each workspace+epoch combination has one Data Y.Doc that syncs with all collaborators.
 * It stores schema definitions, metadata, table data, and KV data.
 *
 * Y.Doc ID: `{workspaceId}-{epoch}`
 *
 * Structure:
 * ```
 * Y.Map('meta')
 *   └── name: string
 *
 * Y.Map('schema')
 *   ├── tables: Y.Map<tableName, Y.Map<fieldName, StoredFieldSchema>>
 *   └── kv: Y.Map<keyName, StoredFieldSchema>
 *
 * Y.Map('tables')
 *   └── {tableName}: Y.Map<rowId, Y.Map<fieldName, value>>
 *
 * Y.Map('kv')
 *   └── {keyName}: value
 * ```
 *
 * @example
 * ```typescript
 * const data = createDataDoc({ workspaceId: 'abc123xyz789012', epoch: 0 });
 *
 * // Merge code schema into Y.Doc (idempotent, call on every create)
 * data.mergeSchema(tables, kv);
 *
 * // Get schema for a table
 * const postsSchema = data.getTableSchema('posts');
 * ```
 */
export function createDataDoc(options: {
	workspaceId: string;
	epoch: number;
	ydoc?: Y.Doc;
}) {
	const { workspaceId, epoch } = options;
	const docId = `${workspaceId}-${epoch}`;
	const ydoc = options.ydoc ?? new Y.Doc({ guid: docId });

	const metaMap = ydoc.getMap<string>('meta');
	const schemaMap = ydoc.getMap<Y.Map<unknown>>('schema');
	const tablesMap = ydoc.getMap<Y.Map<Y.Map<unknown>>>('tables');
	const kvMap = ydoc.getMap<unknown>('kv');

	// Initialize schema submaps if not present
	if (!schemaMap.has('tables')) {
		schemaMap.set('tables', new Y.Map());
	}
	if (!schemaMap.has('kv')) {
		schemaMap.set('kv', new Y.Map());
	}

	function getTablesSchemaMap(): Y.Map<Y.Map<StoredFieldSchema>> {
		return schemaMap.get('tables') as Y.Map<Y.Map<StoredFieldSchema>>;
	}

	function getKvSchemaMap(): Y.Map<StoredFieldSchema> {
		return schemaMap.get('kv') as Y.Map<StoredFieldSchema>;
	}

	return {
		/** The underlying Y.Doc instance. */
		ydoc,

		/** The workspace ID. */
		workspaceId,

		/** The epoch number. */
		epoch,

		/** The full doc ID (`{workspaceId}-{epoch}`). */
		docId,

		// ─────────────────────────────────────────────────────────────────────
		// Metadata
		// ─────────────────────────────────────────────────────────────────────

		/** Get the workspace display name. */
		getName() {
			return metaMap.get('name');
		},

		/** Set the workspace display name. */
		setName(name: string) {
			metaMap.set('name', name);
		},

		// ─────────────────────────────────────────────────────────────────────
		// Schema Management
		// ─────────────────────────────────────────────────────────────────────

		/** Check if schema has any tables or kv fields defined. */
		hasSchema() {
			return getTablesSchemaMap().size > 0 || getKvSchemaMap().size > 0;
		},

		/**
		 * Merge code-defined schema into Y.Doc schema.
		 *
		 * Uses pure merge semantics:
		 * - If table/field doesn't exist → add it
		 * - If table/field exists with different value → update it
		 * - If table/field exists with same value → no-op (CRDT handles)
		 *
		 * Stores full FieldSchema including metadata (name, description, icon)
		 * to enable collaborative schema editing.
		 *
		 * Call on every workspace.create(). Idempotent and safe for concurrent calls.
		 */
		mergeSchema(tables: TablesSchema, kv: KvSchema) {
			ydoc.transact(() => {
				const tablesSchemaMap = getTablesSchemaMap();
				const kvSchemaMap = getKvSchemaMap();

				for (const [tableName, tableSchema] of Object.entries(tables)) {
					let tableMap = tablesSchemaMap.get(tableName);
					if (!tableMap) {
						tableMap = new Y.Map();
						tablesSchemaMap.set(tableName, tableMap);
					}

					for (const [fieldName, fieldSchema] of Object.entries(tableSchema)) {
						const stored = prepareForStorage(fieldSchema);
						const existing = tableMap.get(fieldName);

						if (!existing || !deepEqual(existing, stored)) {
							tableMap.set(fieldName, stored);
						}
					}
				}

				for (const [keyName, fieldSchema] of Object.entries(kv)) {
					const stored = prepareForStorage(fieldSchema);
					const existing = kvSchemaMap.get(keyName);

					if (!existing || !deepEqual(existing, stored)) {
						kvSchemaMap.set(keyName, stored);
					}
				}
			});
		},

		/** Get the schema for a specific table. */
		getTableSchema(tableName: string) {
			const tableMap = getTablesSchemaMap().get(tableName);
			if (!tableMap) return undefined;

			const result = new Map<string, StoredFieldSchema>();
			tableMap.forEach((value, key) => {
				result.set(key, value);
			});
			return result;
		},

		/** Get all table names that have schema defined. */
		getTableNames() {
			return Array.from(getTablesSchemaMap().keys());
		},

		/** Get the schema for a specific KV key. */
		getKvSchema(keyName: string) {
			return getKvSchemaMap().get(keyName);
		},

		/** Get all KV key names that have schema defined. */
		getKvNames() {
			return Array.from(getKvSchemaMap().keys());
		},

		/**
		 * Add a new field to a table schema.
		 *
		 * Enables collaborative schema editing - multiple users can add fields
		 * and CRDT will merge them automatically.
		 */
		addTableField(
			tableName: string,
			fieldName: string,
			fieldSchema: FieldSchema,
		) {
			const tablesSchemaMap = getTablesSchemaMap();

			let tableMap = tablesSchemaMap.get(tableName);
			if (!tableMap) {
				tableMap = new Y.Map();
				tablesSchemaMap.set(tableName, tableMap);
			}

			tableMap.set(fieldName, prepareForStorage(fieldSchema));
		},

		/** Remove a field from a table schema. */
		removeTableField(tableName: string, fieldName: string) {
			const tableMap = getTablesSchemaMap().get(tableName);
			if (tableMap) {
				tableMap.delete(fieldName);
			}
		},

		/** Add a new KV field schema. */
		addKvField(keyName: string, fieldSchema: FieldSchema) {
			getKvSchemaMap().set(keyName, prepareForStorage(fieldSchema));
		},

		/** Remove a KV field schema. */
		removeKvField(keyName: string) {
			getKvSchemaMap().delete(keyName);
		},

		// ─────────────────────────────────────────────────────────────────────
		// Raw Y.Map Access
		// ─────────────────────────────────────────────────────────────────────

		/**
		 * Get the raw tables Y.Map.
		 *
		 * Structure: `{tableName}: Y.Map<rowId, Y.Map<fieldName, value>>`
		 */
		getTablesMap() {
			return tablesMap;
		},

		/**
		 * Get the raw KV Y.Map.
		 *
		 * Structure: `{keyName}: value`
		 */
		getKvMap() {
			return kvMap;
		},

		/** Get the raw schema Y.Map. */
		getSchemaMap() {
			return schemaMap;
		},

		// ─────────────────────────────────────────────────────────────────────
		// Schema Observation
		// ─────────────────────────────────────────────────────────────────────

		/**
		 * Observe changes to table schemas.
		 *
		 * Fires when tables are added/removed or fields within tables change.
		 *
		 * @returns Unsubscribe function
		 */
		observeSchemaChanges(
			callback: (event: {
				tablesAdded: string[];
				tablesRemoved: string[];
				fieldsChanged: Array<{
					table: string;
					field: string;
					action: 'add' | 'update' | 'delete';
				}>;
			}) => void,
		) {
			const tablesSchemaMap = getTablesSchemaMap();
			const fieldHandlers = new Map<
				string,
				(event: Y.YMapEvent<StoredFieldSchema>) => void
			>();

			const setupFieldObserver = (
				tableName: string,
				tableMap: Y.Map<StoredFieldSchema>,
			) => {
				const fieldHandler = (event: Y.YMapEvent<StoredFieldSchema>) => {
					const fieldsChanged: Array<{
						table: string;
						field: string;
						action: 'add' | 'update' | 'delete';
					}> = [];

					event.changes.keys.forEach((change, key) => {
						fieldsChanged.push({
							table: tableName,
							field: key,
							action: change.action as 'add' | 'update' | 'delete',
						});
					});

					if (fieldsChanged.length > 0) {
						callback({ tablesAdded: [], tablesRemoved: [], fieldsChanged });
					}
				};

				tableMap.observe(fieldHandler);
				fieldHandlers.set(tableName, fieldHandler);
			};

			const tableHandler = (event: Y.YMapEvent<Y.Map<StoredFieldSchema>>) => {
				const tablesAdded: string[] = [];
				const tablesRemoved: string[] = [];

				event.changes.keys.forEach((change, key) => {
					if (change.action === 'add') {
						tablesAdded.push(key);
						const tableMap = tablesSchemaMap.get(key);
						if (tableMap) {
							setupFieldObserver(key, tableMap);
						}
					} else if (change.action === 'delete') {
						tablesRemoved.push(key);
						fieldHandlers.delete(key);
					}
				});

				if (tablesAdded.length > 0 || tablesRemoved.length > 0) {
					callback({ tablesAdded, tablesRemoved, fieldsChanged: [] });
				}
			};

			tablesSchemaMap.forEach((tableMap, tableName) => {
				setupFieldObserver(tableName, tableMap);
			});

			tablesSchemaMap.observe(tableHandler);

			return () => {
				tablesSchemaMap.unobserve(tableHandler);
			};
		},

		/** Destroy the data doc and clean up resources. */
		destroy() {
			ydoc.destroy();
		},
	};
}

/** Data Y.Doc wrapper type - inferred from factory function. */
export type DataDoc = ReturnType<typeof createDataDoc>;

/** Schema change event type for observeSchemaChanges callback. */
export type SchemaChangeEvent = Parameters<
	Parameters<DataDoc['observeSchemaChanges']>[0]
>[0];
