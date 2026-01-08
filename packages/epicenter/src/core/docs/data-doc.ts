import * as Y from 'yjs';

import type { KvSchema, TablesSchema } from '../schema';
import type { FieldSchema } from '../schema/fields/types';

/**
 * Serialized field schema for Y.Doc storage.
 *
 * This is the JSON representation of a field definition stored in the Y.Doc.
 * It mirrors the FieldSchema type but is guaranteed to be JSON-serializable.
 */
export type SerializedFieldSchema = {
	type: FieldSchema['type'];
	nullable?: boolean;
	default?: unknown;
	options?: readonly string[];
	schema?: unknown; // JSON schema for json fields
};

/**
 * Schema change event for observeSchemaChanges callback.
 */
export type SchemaChangeEvent = {
	tablesAdded: string[];
	tablesRemoved: string[];
	fieldsChanged: Array<{
		table: string;
		field: string;
		action: 'add' | 'update' | 'delete';
	}>;
};

/**
 * Data Y.Doc wrapper - Contains all workspace data and schema for a specific epoch.
 *
 * Each workspace+epoch combination has one Data Y.Doc that syncs with all collaborators.
 * It stores:
 * - Schema definitions (tables, fields, kv)
 * - Metadata (workspace name)
 * - Table data
 * - KV data
 *
 * Y.Doc ID: `{workspaceId}-{epoch}`
 *
 * Structure:
 * ```
 * Y.Map('meta')
 *   └── name: string
 *
 * Y.Map('schema')
 *   ├── tables: Y.Map<tableName, Y.Map<fieldName, SerializedFieldSchema>>
 *   └── kv: Y.Map<keyName, SerializedFieldSchema>
 *
 * Y.Map('tables')
 *   └── {tableName}: Y.Map<rowId, Y.Map<fieldName, value>>
 *
 * Y.Map('kv')
 *   └── {keyName}: value
 * ```
 */
export type DataDoc = {
	/** The underlying Y.Doc instance. */
	ydoc: Y.Doc;
	/** The workspace ID. */
	workspaceId: string;
	/** The epoch number. */
	epoch: number;
	/** The full doc ID (`{workspaceId}-{epoch}`). */
	docId: string;

	// ─────────────────────────────────────────────────────────────────────────
	// Metadata
	// ─────────────────────────────────────────────────────────────────────────

	/** Get the workspace display name. */
	getName(): string | undefined;
	/** Set the workspace display name. */
	setName(name: string): void;

	// ─────────────────────────────────────────────────────────────────────────
	// Schema Management
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Check if schema has any tables or kv fields defined.
	 */
	hasSchema(): boolean;

	/**
	 * Merge code-defined schema into Y.Doc schema.
	 *
	 * Uses pure merge semantics:
	 * - If table/field doesn't exist → add it
	 * - If table/field exists with different value → update it
	 * - If table/field exists with same value → no-op (CRDT handles)
	 *
	 * Call this on every workspace.create(). It's idempotent and safe to call
	 * multiple times. The CRDT merge ensures eventual consistency across peers.
	 *
	 * TypeScript types come from code schema (compile-time).
	 * Runtime validation uses Y.Doc schema (can diverge if collaboratively edited).
	 */
	mergeSchema(tables: TablesSchema, kv: KvSchema): void;

	/** Get the schema for a specific table. */
	getTableSchema(
		tableName: string,
	): Map<string, SerializedFieldSchema> | undefined;

	/** Get all table names that have schema defined. */
	getTableNames(): string[];

	/** Get the schema for a specific KV key. */
	getKvSchema(keyName: string): SerializedFieldSchema | undefined;

	/** Get all KV key names that have schema defined. */
	getKvNames(): string[];

	/**
	 * Add a new field to a table schema.
	 *
	 * This enables collaborative schema editing - multiple users can add fields
	 * and CRDT will merge them automatically.
	 */
	addTableField(
		tableName: string,
		fieldName: string,
		fieldSchema: FieldSchema,
	): void;

	/** Remove a field from a table schema. */
	removeTableField(tableName: string, fieldName: string): void;

	/** Add a new KV field schema. */
	addKvField(keyName: string, fieldSchema: FieldSchema): void;

	/** Remove a KV field schema. */
	removeKvField(keyName: string): void;

	// ─────────────────────────────────────────────────────────────────────────
	// Raw Y.Map Access (for table operations)
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Get the raw tables Y.Map.
	 *
	 * Structure: `{tableName}: Y.Map<rowId, Y.Map<fieldName, value>>`
	 */
	getTablesMap(): Y.Map<Y.Map<Y.Map<unknown>>>;

	/**
	 * Get the raw KV Y.Map.
	 *
	 * Structure: `{keyName}: value`
	 */
	getKvMap(): Y.Map<unknown>;

	/** Get the raw schema Y.Map. */
	getSchemaMap(): Y.Map<Y.Map<unknown>>;

	// ─────────────────────────────────────────────────────────────────────────
	// Schema Observation
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Observe changes to table schemas.
	 *
	 * Fires when tables are added/removed or fields within tables change.
	 *
	 * @returns Unsubscribe function
	 */
	observeSchemaChanges(
		callback: (event: SchemaChangeEvent) => void,
	): () => void;

	/** Destroy the data doc and clean up resources. */
	destroy(): void;
};

/**
 * Serialize a FieldSchema to a JSON-safe format for Y.Doc storage.
 */
function serializeFieldSchema(schema: FieldSchema): SerializedFieldSchema {
	const serialized: SerializedFieldSchema = {
		type: schema.type,
	};

	// Check for nullable (not present on IdFieldSchema, RichtextFieldSchema)
	if ('nullable' in schema && schema.nullable !== undefined) {
		serialized.nullable = schema.nullable;
	}

	// Check for default (not present on IdFieldSchema, RichtextFieldSchema)
	if ('default' in schema && schema.default !== undefined) {
		// Functions can't be serialized, so we evaluate them
		const defaultValue = schema.default;
		serialized.default =
			typeof defaultValue === 'function' ? defaultValue() : defaultValue;
	}

	if ('options' in schema && schema.options !== undefined) {
		serialized.options = schema.options as readonly string[];
	}

	if ('schema' in schema && schema.schema !== undefined) {
		// For JSON fields, store the schema definition
		// This would need proper JSON Schema conversion in production
		serialized.schema = schema.schema;
	}

	return serialized;
}

/**
 * Shallow equality check for serialized field schemas.
 * Compares top-level keys and array values (for options).
 */
function shallowEqual(
	a: SerializedFieldSchema,
	b: SerializedFieldSchema,
): boolean {
	if (a.type !== b.type) return false;
	if (a.nullable !== b.nullable) return false;
	if (a.default !== b.default) return false;

	// Compare options arrays
	if (a.options !== b.options) {
		if (!a.options || !b.options) return false;
		if (a.options.length !== b.options.length) return false;
		for (let i = 0; i < a.options.length; i++) {
			if (a.options[i] !== b.options[i]) return false;
		}
	}

	// For JSON schema, do reference equality (deep comparison would be expensive)
	if (a.schema !== b.schema) return false;

	return true;
}

/**
 * Create a Data Y.Doc wrapper for managing workspace data and schema.
 *
 * @example
 * ```typescript
 * const data = createDataDoc({
 *   workspaceId: 'abc123xyz789012',
 *   epoch: 0,
 * });
 *
 * // Merge code schema into Y.Doc (idempotent, call on every create)
 * data.mergeSchema(workspaceSchema.tables, workspaceSchema.kv);
 *
 * // Get schema for a table
 * const postsSchema = data.getTableSchema('posts');
 *
 * // Access raw Y.Maps for table operations
 * const tablesMap = data.getTablesMap();
 * const kvMap = data.getKvMap();
 * ```
 */
export function createDataDoc(options: {
	workspaceId: string;
	epoch: number;
	ydoc?: Y.Doc;
}): DataDoc {
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

	function getTablesSchemaMap(): Y.Map<Y.Map<SerializedFieldSchema>> {
		return schemaMap.get('tables') as Y.Map<Y.Map<SerializedFieldSchema>>;
	}

	function getKvSchemaMap(): Y.Map<SerializedFieldSchema> {
		return schemaMap.get('kv') as Y.Map<SerializedFieldSchema>;
	}

	return {
		ydoc,
		workspaceId,
		epoch,
		docId,

		// ─────────────────────────────────────────────────────────────────────
		// Metadata
		// ─────────────────────────────────────────────────────────────────────

		getName() {
			return metaMap.get('name');
		},

		setName(name) {
			metaMap.set('name', name);
		},

		// ─────────────────────────────────────────────────────────────────────
		// Schema Management
		// ─────────────────────────────────────────────────────────────────────

		hasSchema() {
			return getTablesSchemaMap().size > 0 || getKvSchemaMap().size > 0;
		},

		mergeSchema(tables, kv) {
			ydoc.transact(() => {
				const tablesSchemaMap = getTablesSchemaMap();
				const kvSchemaMap = getKvSchemaMap();

				// Merge table schemas
				for (const [tableName, tableSchema] of Object.entries(tables)) {
					let tableMap = tablesSchemaMap.get(tableName);
					if (!tableMap) {
						tableMap = new Y.Map();
						tablesSchemaMap.set(tableName, tableMap);
					}

					for (const [fieldName, fieldSchema] of Object.entries(tableSchema)) {
						const serialized = serializeFieldSchema(fieldSchema);
						const existing = tableMap.get(fieldName);

						// Only write if different (avoid unnecessary CRDT operations)
						if (!existing || !shallowEqual(existing, serialized)) {
							tableMap.set(fieldName, serialized);
						}
					}
				}

				// Merge KV schemas
				for (const [keyName, fieldSchema] of Object.entries(kv)) {
					const serialized = serializeFieldSchema(fieldSchema);
					const existing = kvSchemaMap.get(keyName);

					// Only write if different
					if (!existing || !shallowEqual(existing, serialized)) {
						kvSchemaMap.set(keyName, serialized);
					}
				}
			});
		},

		getTableSchema(tableName) {
			const tableMap = getTablesSchemaMap().get(tableName);
			if (!tableMap) return undefined;

			const result = new Map<string, SerializedFieldSchema>();
			tableMap.forEach((value, key) => {
				result.set(key, value);
			});
			return result;
		},

		getTableNames() {
			return Array.from(getTablesSchemaMap().keys());
		},

		getKvSchema(keyName) {
			return getKvSchemaMap().get(keyName);
		},

		getKvNames() {
			return Array.from(getKvSchemaMap().keys());
		},

		addTableField(tableName, fieldName, fieldSchema) {
			const tablesSchemaMap = getTablesSchemaMap();

			let tableMap = tablesSchemaMap.get(tableName);
			if (!tableMap) {
				tableMap = new Y.Map();
				tablesSchemaMap.set(tableName, tableMap);
			}

			tableMap.set(fieldName, serializeFieldSchema(fieldSchema));
		},

		removeTableField(tableName, fieldName) {
			const tableMap = getTablesSchemaMap().get(tableName);
			if (tableMap) {
				tableMap.delete(fieldName);
			}
		},

		addKvField(keyName, fieldSchema) {
			getKvSchemaMap().set(keyName, serializeFieldSchema(fieldSchema));
		},

		removeKvField(keyName) {
			getKvSchemaMap().delete(keyName);
		},

		// ─────────────────────────────────────────────────────────────────────
		// Raw Y.Map Access
		// ─────────────────────────────────────────────────────────────────────

		getTablesMap() {
			return tablesMap;
		},

		getKvMap() {
			return kvMap;
		},

		getSchemaMap() {
			return schemaMap;
		},

		// ─────────────────────────────────────────────────────────────────────
		// Schema Observation
		// ─────────────────────────────────────────────────────────────────────

		observeSchemaChanges(callback) {
			const tablesSchemaMap = getTablesSchemaMap();
			const fieldHandlers = new Map<
				string,
				(event: Y.YMapEvent<SerializedFieldSchema>) => void
			>();

			const setupFieldObserver = (
				tableName: string,
				tableMap: Y.Map<SerializedFieldSchema>,
			) => {
				const fieldHandler = (event: Y.YMapEvent<SerializedFieldSchema>) => {
					const fieldsChanged: SchemaChangeEvent['fieldsChanged'] = [];

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

			// Track table-level changes
			const tableHandler = (
				event: Y.YMapEvent<Y.Map<SerializedFieldSchema>>,
			) => {
				const tablesAdded: string[] = [];
				const tablesRemoved: string[] = [];

				event.changes.keys.forEach((change, key) => {
					if (change.action === 'add') {
						tablesAdded.push(key);
						// Setup observer for new table
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

			// Setup observers for existing tables
			tablesSchemaMap.forEach((tableMap, tableName) => {
				setupFieldObserver(tableName, tableMap);
			});

			tablesSchemaMap.observe(tableHandler);

			return () => {
				tablesSchemaMap.unobserve(tableHandler);
				// Field handlers are implicitly cleaned up when their Y.Maps are garbage collected
			};
		},

		destroy() {
			ydoc.destroy();
		},
	};
}
