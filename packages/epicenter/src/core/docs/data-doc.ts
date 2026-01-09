import * as Y from 'yjs';

import type { KvSchema, TablesSchema, TablesWithMetadata } from '../schema';
import type {
	FieldSchema,
	TableDefinition,
	IconDefinition,
	CoverDefinition,
} from '../schema/fields/types';

/**
 * Deep equality check for field schemas.
 *
 * Compares all properties including metadata (name, description, icon).
 * Works with FieldSchema directly since TypeBox schemas are JSON-serializable.
 */
function deepEqual(a: FieldSchema, b: FieldSchema): boolean {
	// Type must match
	if (a.type !== b.type) return false;

	// Compare metadata (present on all field types)
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

	// Compare optional properties using JSON serialization for simplicity
	// This handles nullable, default, options, schema across all field types
	return JSON.stringify(a) === JSON.stringify(b);
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
 *   ├── name: string           # Workspace display name
 *   └── slug: string           # Human-readable identifier for paths/URLs
 *
 * Y.Map('schema')
 *   ├── tables: Y.Map<tableName, {
 *   │     name: string,        # Table display name
 *   │     icon: IconDefinition | null,
 *   │     cover: CoverDefinition | null,
 *   │     description: string,
 *   │     fields: Y.Map<fieldName, FieldSchema>
 *   │   }>
 *   └── kv: Y.Map<keyName, FieldSchema>
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

	/**
	 * Type for the inner Y.Map that stores table schema with metadata.
	 * Structure: { name, icon, cover, description, fields: Y.Map<FieldSchema> }
	 */
	type TableSchemaMap = Y.Map<
		string | IconDefinition | CoverDefinition | null | Y.Map<FieldSchema>
	>;

	function getTablesSchemaMap(): Y.Map<TableSchemaMap> {
		return schemaMap.get('tables') as Y.Map<TableSchemaMap>;
	}

	function getKvSchemaMap(): Y.Map<FieldSchema> {
		return schemaMap.get('kv') as Y.Map<FieldSchema>;
	}

	/**
	 * Get the fields Y.Map for a specific table.
	 * Creates the table and fields map if they don't exist.
	 */
	function getOrCreateTableFieldsMap(tableName: string): Y.Map<FieldSchema> {
		const tablesSchemaMap = getTablesSchemaMap();
		let tableMap = tablesSchemaMap.get(tableName);

		if (!tableMap) {
			tableMap = new Y.Map() as TableSchemaMap;
			tableMap.set('name', tableName); // Default name = table key
			tableMap.set('icon', null);
			tableMap.set('cover', null);
			tableMap.set('description', '');
			tableMap.set('fields', new Y.Map<FieldSchema>());
			tablesSchemaMap.set(tableName, tableMap);
		}

		let fieldsMap = tableMap.get('fields') as Y.Map<FieldSchema> | undefined;
		if (!fieldsMap) {
			fieldsMap = new Y.Map<FieldSchema>();
			tableMap.set('fields', fieldsMap);
		}

		return fieldsMap;
	}

	/**
	 * Check if a table value is a TablesWithMetadata format (has 'fields' property).
	 */
	function isTableDefinition(
		value: Record<string, FieldSchema> | TableDefinition,
	): value is TableDefinition {
		return 'fields' in value && typeof value.fields === 'object';
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

		/** Get the workspace slug (human-readable identifier for paths/URLs). */
		getSlug() {
			return metaMap.get('slug');
		},

		/** Set the workspace slug. */
		setSlug(slug: string) {
			metaMap.set('slug', slug);
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
		 * Accepts both formats:
		 * - TablesSchema: Simple `{ tableName: { fieldName: FieldSchema } }`
		 * - TablesWithMetadata: Full `{ tableName: TableDefinition }` with name, icon, cover, description
		 *
		 * Stores full FieldSchema including metadata (name, description, icon)
		 * to enable collaborative schema editing.
		 *
		 * Call on every workspace.create(). Idempotent and safe for concurrent calls.
		 */
		mergeSchema(tables: TablesSchema | TablesWithMetadata, kv: KvSchema) {
			ydoc.transact(() => {
				const tablesSchemaMap = getTablesSchemaMap();
				const kvSchemaMap = getKvSchemaMap();

				for (const [tableName, tableValue] of Object.entries(tables)) {
					// Determine if this is TablesWithMetadata or TablesSchema format
					const tableDefinition: TableDefinition = isTableDefinition(tableValue)
						? tableValue
						: {
								name: tableName,
								icon: null,
								cover: null,
								description: '',
								fields: tableValue,
							};

					// Get or create the table schema map
					let tableMap = tablesSchemaMap.get(tableName);
					if (!tableMap) {
						tableMap = new Y.Map() as TableSchemaMap;
						tableMap.set('fields', new Y.Map<FieldSchema>());
						tablesSchemaMap.set(tableName, tableMap);
					}

					// Merge table metadata
					const currentName = tableMap.get('name') as string | undefined;
					if (currentName !== tableDefinition.name) {
						tableMap.set('name', tableDefinition.name);
					}

					const currentIcon = tableMap.get('icon') as
						| IconDefinition
						| null
						| undefined;
					if (
						JSON.stringify(currentIcon) !== JSON.stringify(tableDefinition.icon)
					) {
						tableMap.set('icon', tableDefinition.icon);
					}

					const currentCover = tableMap.get('cover') as
						| CoverDefinition
						| null
						| undefined;
					if (
						JSON.stringify(currentCover) !==
						JSON.stringify(tableDefinition.cover)
					) {
						tableMap.set('cover', tableDefinition.cover);
					}

					const currentDescription = tableMap.get('description') as
						| string
						| undefined;
					if (currentDescription !== tableDefinition.description) {
						tableMap.set('description', tableDefinition.description);
					}

					// Merge fields
					let fieldsMap = tableMap.get('fields') as
						| Y.Map<FieldSchema>
						| undefined;
					if (!fieldsMap) {
						fieldsMap = new Y.Map();
						tableMap.set('fields', fieldsMap);
					}

					for (const [fieldName, fieldSchema] of Object.entries(
						tableDefinition.fields,
					)) {
						const existing = fieldsMap.get(fieldName);

						if (!existing || !deepEqual(existing, fieldSchema)) {
							fieldsMap.set(fieldName, fieldSchema);
						}
					}
				}

				for (const [keyName, fieldSchema] of Object.entries(kv)) {
					const existing = kvSchemaMap.get(keyName);

					if (!existing || !deepEqual(existing, fieldSchema)) {
						kvSchemaMap.set(keyName, fieldSchema);
					}
				}
			});
		},

		/**
		 * Get the field schemas for a specific table.
		 * Returns a Map of fieldName → FieldSchema.
		 */
		getTableSchema(tableName: string) {
			const tableMap = getTablesSchemaMap().get(tableName);
			if (!tableMap) return undefined;

			const fieldsMap = tableMap.get('fields') as
				| Y.Map<FieldSchema>
				| undefined;
			if (!fieldsMap) return undefined;

			const result = new Map<string, FieldSchema>();
			fieldsMap.forEach((value, key) => {
				result.set(key, value);
			});
			return result;
		},

		/**
		 * Get the full table definition including metadata and fields.
		 * Returns the TableDefinition with all metadata (name, icon, cover, description, fields).
		 *
		 * Note: Returns a general Record type for fields since we can't guarantee
		 * at runtime that the Y.Doc contains a valid `id` field. The caller should
		 * validate the schema if strict typing is needed.
		 */
		getTableDefinition(tableName: string):
			| (Omit<TableDefinition, 'fields'> & {
					fields: Record<string, FieldSchema>;
			  })
			| undefined {
			const tableMap = getTablesSchemaMap().get(tableName);
			if (!tableMap) return undefined;

			const fieldsMap = tableMap.get('fields') as
				| Y.Map<FieldSchema>
				| undefined;
			const fields: Record<string, FieldSchema> = {};
			if (fieldsMap) {
				fieldsMap.forEach((value, key) => {
					fields[key] = value;
				});
			}

			return {
				name: (tableMap.get('name') as string) || tableName,
				icon: (tableMap.get('icon') as IconDefinition | null) ?? null,
				cover: (tableMap.get('cover') as CoverDefinition | null) ?? null,
				description: (tableMap.get('description') as string) || '',
				fields,
			};
		},

		/**
		 * Update table metadata (name, icon, cover, description).
		 * Does not affect field schemas.
		 */
		setTableMetadata(
			tableName: string,
			metadata: Partial<Omit<TableDefinition, 'fields'>>,
		) {
			const tablesSchemaMap = getTablesSchemaMap();
			let tableMap = tablesSchemaMap.get(tableName);

			if (!tableMap) {
				// Create table if it doesn't exist
				tableMap = new Y.Map() as TableSchemaMap;
				tableMap.set('name', metadata.name ?? tableName);
				tableMap.set('icon', metadata.icon ?? null);
				tableMap.set('cover', metadata.cover ?? null);
				tableMap.set('description', metadata.description ?? '');
				tableMap.set('fields', new Y.Map<FieldSchema>());
				tablesSchemaMap.set(tableName, tableMap);
				return;
			}

			// Update only provided fields
			if (metadata.name !== undefined) {
				tableMap.set('name', metadata.name);
			}
			if (metadata.icon !== undefined) {
				tableMap.set('icon', metadata.icon);
			}
			if (metadata.cover !== undefined) {
				tableMap.set('cover', metadata.cover);
			}
			if (metadata.description !== undefined) {
				tableMap.set('description', metadata.description);
			}
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
			const fieldsMap = getOrCreateTableFieldsMap(tableName);
			fieldsMap.set(fieldName, fieldSchema);
		},

		/** Remove a field from a table schema. */
		removeTableField(tableName: string, fieldName: string) {
			const tableMap = getTablesSchemaMap().get(tableName);
			if (tableMap) {
				const fieldsMap = tableMap.get('fields') as
					| Y.Map<FieldSchema>
					| undefined;
				if (fieldsMap) {
					fieldsMap.delete(fieldName);
				}
			}
		},

		/** Add a new KV field schema. */
		addKvField(keyName: string, fieldSchema: FieldSchema) {
			getKvSchemaMap().set(keyName, fieldSchema);
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
				(event: Y.YMapEvent<FieldSchema>) => void
			>();

			const setupFieldObserver = (
				tableName: string,
				tableMap: TableSchemaMap,
			) => {
				const fieldsMap = tableMap.get('fields') as
					| Y.Map<FieldSchema>
					| undefined;
				if (!fieldsMap) return;

				const fieldHandler = (event: Y.YMapEvent<FieldSchema>) => {
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

				fieldsMap.observe(fieldHandler);
				fieldHandlers.set(tableName, fieldHandler);
			};

			const tableHandler = (event: Y.YMapEvent<TableSchemaMap>) => {
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
