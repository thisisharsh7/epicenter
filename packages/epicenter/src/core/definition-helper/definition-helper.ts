import * as Y from 'yjs';
import type {
	DefinitionMap,
	WorkspaceDefinitionMap,
} from '../docs/workspace-doc';
import type {
	FieldSchema,
	IconDefinition,
	KvDefinition,
	TableDefinition,
} from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Y.Map storing table definitions, keyed by table name. */
export type TablesDefinitionMap = Y.Map<Y.Map<unknown>>;

/** Y.Map storing KV definitions, keyed by key name. */
export type KvDefinitionYMap = Y.Map<Y.Map<unknown>>;

/** Y.Map storing fields for a single table, keyed by field name. */
export type FieldsMap = Y.Map<FieldSchema>;

/** Change action for collection observation. */
export type ChangeAction = 'add' | 'delete';

/** Change action for field observation (fields can be updated). */
export type FieldChangeAction = 'add' | 'update' | 'delete';

/**
 * Metadata for a table (name, icon, description).
 */
export type TableMetadata = {
	name: string;
	icon: IconDefinition | null;
	description: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Field Helper (per-field operations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper for a single field within a table.
 *
 * @example
 * ```typescript
 * const title = definition.tables('posts')?.fields('title');
 * if (title) {
 *   console.log(title.toJSON());  // { type: 'text', ... }
 *   title.set(text({ default: 'Untitled' }));
 *   title.delete();
 * }
 * ```
 */
export type FieldHelper = {
	/** Get the field schema as JSON. */
	toJSON(): FieldSchema;
	/** Replace the field schema. */
	set(schema: FieldSchema): void;
	/** Delete this field from the table. Returns true if deleted. */
	delete(): boolean;
	/** Observe changes to this field. */
	observe(callback: (schema: FieldSchema) => void): () => void;
};

function createFieldHelper(
	fieldsMap: FieldsMap,
	fieldName: string,
): FieldHelper {
	return {
		toJSON() {
			return fieldsMap.get(fieldName)!;
		},
		set(schema) {
			fieldsMap.set(fieldName, schema);
		},
		delete() {
			if (!fieldsMap.has(fieldName)) return false;
			fieldsMap.delete(fieldName);
			return true;
		},
		observe(callback) {
			const handler = (event: Y.YMapEvent<FieldSchema>) => {
				if (event.keysChanged.has(fieldName)) {
					const schema = fieldsMap.get(fieldName);
					if (schema) callback(schema);
				}
			};
			fieldsMap.observe(handler);
			return () => fieldsMap.unobserve(handler);
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Fields Collection (callable with properties)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable collection for fields within a table.
 *
 * Call with a field name to get a FieldHelper, or use properties for bulk operations.
 *
 * @example
 * ```typescript
 * // Get a specific field helper
 * const title = table.fields('title');
 *
 * // Bulk operations
 * table.fields.toJSON();           // all fields as JSON
 * table.fields.keys();             // ['id', 'title', ...]
 * table.fields.set('dueDate', date());
 * table.fields.observe(cb);
 * ```
 */
export type FieldsCollection = {
	(fieldName: string): FieldHelper | undefined;
	toJSON(): Record<string, FieldSchema>;
	keys(): string[];
	set(fieldName: string, schema: FieldSchema): void;
	observe(
		callback: (changes: Map<string, FieldChangeAction>) => void,
	): () => void;
};

function createFieldsCollection(
	tableDefinitionMap: Y.Map<unknown>,
): FieldsCollection {
	const getFieldsMap = (): FieldsMap | null => {
		return (tableDefinitionMap.get('fields') as FieldsMap) ?? null;
	};

	const getOrCreateFieldsMap = (): FieldsMap => {
		let fieldsMap = tableDefinitionMap.get('fields') as FieldsMap | undefined;
		if (!fieldsMap) {
			fieldsMap = new Y.Map() as FieldsMap;
			tableDefinitionMap.set('fields', fieldsMap);
		}
		return fieldsMap;
	};

	// Cache for field helpers
	const fieldHelperCache = new Map<string, FieldHelper>();

	const fieldsAccessor = (fieldName: string): FieldHelper | undefined => {
		const fieldsMap = getFieldsMap();
		if (!fieldsMap || !fieldsMap.has(fieldName)) return undefined;

		let helper = fieldHelperCache.get(fieldName);
		if (!helper) {
			helper = createFieldHelper(fieldsMap, fieldName);
			fieldHelperCache.set(fieldName, helper);
		}
		return helper;
	};

	return Object.assign(fieldsAccessor, {
		toJSON(): Record<string, FieldSchema> {
			const fieldsMap = getFieldsMap();
			if (!fieldsMap) return {};
			return fieldsMap.toJSON() as Record<string, FieldSchema>;
		},

		keys(): string[] {
			const fieldsMap = getFieldsMap();
			if (!fieldsMap) return [];
			return Array.from(fieldsMap.keys());
		},

		set(fieldName: string, schema: FieldSchema): void {
			getOrCreateFieldsMap().set(fieldName, schema);
			fieldHelperCache.delete(fieldName);
		},

		observe(
			callback: (changes: Map<string, FieldChangeAction>) => void,
		): () => void {
			const handler = (event: Y.YMapEvent<FieldSchema>) => {
				const changes = new Map<string, FieldChangeAction>();
				event.changes.keys.forEach((change, key) => {
					changes.set(key, change.action);
				});
				if (changes.size > 0) callback(changes);
			};

			const fieldsMap = getOrCreateFieldsMap();
			fieldsMap.observe(handler);
			return () => fieldsMap.unobserve(handler);
		},
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper for table metadata (name, icon, description).
 */
export type MetadataHelper = {
	toJSON(): TableMetadata;
	set(metadata: Partial<TableMetadata>): void;
	observe(callback: (metadata: TableMetadata) => void): () => void;
};

function createMetadataHelper(
	tableDefinitionMap: Y.Map<unknown>,
): MetadataHelper {
	return {
		toJSON() {
			return {
				name: (tableDefinitionMap.get('name') as string) ?? '',
				icon: (tableDefinitionMap.get('icon') as IconDefinition | null) ?? null,
				description: (tableDefinitionMap.get('description') as string) ?? '',
			};
		},

		set(metadata) {
			if (metadata.name !== undefined) {
				tableDefinitionMap.set('name', metadata.name);
			}
			if (metadata.icon !== undefined) {
				tableDefinitionMap.set('icon', metadata.icon);
			}
			if (metadata.description !== undefined) {
				tableDefinitionMap.set('description', metadata.description);
			}
		},

		observe(callback) {
			const handler = () => {
				callback(this.toJSON());
			};
			tableDefinitionMap.observe(handler);
			return () => tableDefinitionMap.unobserve(handler);
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Helper (per-table operations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper for a single table's definition.
 *
 * @example
 * ```typescript
 * const posts = definition.tables('posts');
 * if (posts) {
 *   posts.toJSON();                    // full table definition
 *   posts.set(newDefinition);          // replace entire definition
 *   posts.delete();                    // remove the table
 *   posts.fields('title')?.toJSON();   // get a field
 *   posts.metadata.set({ name: 'Blog Posts' });
 * }
 * ```
 */
export type TableHelper = {
	toJSON(): TableDefinition;
	set(definition: TableDefinition): void;
	delete(): boolean;
	observe(callback: () => void): () => void;
	fields: FieldsCollection;
	metadata: MetadataHelper;
};

function createTableHelper(
	tablesMap: TablesDefinitionMap,
	tableDefinitionMap: Y.Map<unknown>,
	tableName: string,
): TableHelper {
	return {
		toJSON() {
			return {
				name: (tableDefinitionMap.get('name') as string) ?? '',
				icon: (tableDefinitionMap.get('icon') as IconDefinition | null) ?? null,
				description: (tableDefinitionMap.get('description') as string) ?? '',
				fields:
					(tableDefinitionMap.get('fields') as Y.Map<FieldSchema>)?.toJSON() ??
					{},
			} as TableDefinition;
		},

		set(definition) {
			tableDefinitionMap.set('name', definition.name);
			tableDefinitionMap.set('icon', definition.icon);
			tableDefinitionMap.set('description', definition.description);

			let fieldsMap = tableDefinitionMap.get('fields') as FieldsMap | undefined;
			if (!fieldsMap) {
				fieldsMap = new Y.Map() as FieldsMap;
				tableDefinitionMap.set('fields', fieldsMap);
			}

			// Clear existing fields and set new ones
			fieldsMap.clear();
			for (const [fieldName, fieldSchema] of Object.entries(
				definition.fields,
			)) {
				fieldsMap.set(fieldName, fieldSchema as FieldSchema);
			}
		},

		delete() {
			if (!tablesMap.has(tableName)) return false;
			tablesMap.delete(tableName);
			return true;
		},

		observe(callback) {
			tableDefinitionMap.observeDeep(callback);
			return () => tableDefinitionMap.unobserveDeep(callback);
		},

		fields: createFieldsCollection(tableDefinitionMap),
		metadata: createMetadataHelper(tableDefinitionMap),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Tables Collection (callable with properties)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable collection for table definitions.
 *
 * Call with a table name to get a TableHelper, or use properties for bulk operations.
 *
 * @example
 * ```typescript
 * // Get a specific table helper
 * const posts = definition.tables('posts');
 *
 * // Bulk operations
 * definition.tables.toJSON();      // all tables as JSON
 * definition.tables.keys();        // ['posts', 'users', ...]
 * definition.tables.set('tasks', table({ ... }));
 * definition.tables.observe(cb);
 * ```
 */
export type TablesCollection = {
	(tableName: string): TableHelper | undefined;
	toJSON(): Record<string, TableDefinition>;
	keys(): string[];
	set(tableName: string, definition: TableDefinition): void;
	observe(callback: (changes: Map<string, ChangeAction>) => void): () => void;
};

function createTablesCollection(
	definitionMap: DefinitionMap,
): TablesCollection {
	const getTablesMap = (): TablesDefinitionMap | null => {
		return (definitionMap.get('tables') as TablesDefinitionMap) ?? null;
	};

	const getOrCreateTablesMap = (): TablesDefinitionMap => {
		let tablesMap = definitionMap.get('tables') as
			| TablesDefinitionMap
			| undefined;
		if (!tablesMap) {
			tablesMap = new Y.Map() as TablesDefinitionMap;
			definitionMap.set('tables', tablesMap);
		}
		return tablesMap;
	};

	// Cache for table helpers
	const tableHelperCache = new Map<string, TableHelper>();

	const tablesAccessor = (tableName: string): TableHelper | undefined => {
		const tablesMap = getTablesMap();
		if (!tablesMap) return undefined;

		const tableDefinitionMap = tablesMap.get(tableName);
		if (!tableDefinitionMap) return undefined;

		let helper = tableHelperCache.get(tableName);
		if (!helper) {
			helper = createTableHelper(tablesMap, tableDefinitionMap, tableName);
			tableHelperCache.set(tableName, helper);
		}
		return helper;
	};

	return Object.assign(tablesAccessor, {
		toJSON(): Record<string, TableDefinition> {
			const tablesMap = getTablesMap();
			if (!tablesMap) return {};

			const result: Record<string, TableDefinition> = {};
			for (const [tableName, tableDefinitionMap] of tablesMap.entries()) {
				result[tableName] = {
					name: (tableDefinitionMap.get('name') as string) ?? '',
					icon:
						(tableDefinitionMap.get('icon') as IconDefinition | null) ?? null,
					description: (tableDefinitionMap.get('description') as string) ?? '',
					fields:
						(
							tableDefinitionMap.get('fields') as Y.Map<FieldSchema>
						)?.toJSON() ?? {},
				} as TableDefinition;
			}
			return result;
		},

		keys(): string[] {
			const tablesMap = getTablesMap();
			if (!tablesMap) return [];
			return Array.from(tablesMap.keys());
		},

		set(tableName: string, definition: TableDefinition): void {
			const tablesMap = getOrCreateTablesMap();

			let tableDefinitionMap = tablesMap.get(tableName);
			if (!tableDefinitionMap) {
				tableDefinitionMap = new Y.Map();
				tablesMap.set(tableName, tableDefinitionMap);
			}

			tableDefinitionMap.set('name', definition.name);
			tableDefinitionMap.set('icon', definition.icon);
			tableDefinitionMap.set('description', definition.description);

			let fieldsMap = tableDefinitionMap.get('fields') as FieldsMap | undefined;
			if (!fieldsMap) {
				fieldsMap = new Y.Map() as FieldsMap;
				tableDefinitionMap.set('fields', fieldsMap);
			}

			for (const [fieldName, fieldSchema] of Object.entries(
				definition.fields,
			)) {
				fieldsMap.set(fieldName, fieldSchema as FieldSchema);
			}

			tableHelperCache.delete(tableName);
		},

		observe(
			callback: (changes: Map<string, ChangeAction>) => void,
		): () => void {
			const handler = (event: Y.YMapEvent<Y.Map<unknown>>) => {
				const changes = new Map<string, ChangeAction>();
				event.changes.keys.forEach((change, key) => {
					if (change.action === 'add' || change.action === 'delete') {
						changes.set(key, change.action);
					}
				});
				if (changes.size > 0) callback(changes);
			};

			const tablesMap = getOrCreateTablesMap();
			tablesMap.observe(handler);
			return () => tablesMap.unobserve(handler);
		},
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// KV Helper (per-key operations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Helper for a single KV definition.
 *
 * @example
 * ```typescript
 * const theme = definition.kv('theme');
 * if (theme) {
 *   theme.toJSON();    // { name: 'Theme', field: { type: 'select', ... } }
 *   theme.set(setting({ ... }));
 *   theme.delete();
 * }
 * ```
 */
export type KvHelper = {
	toJSON(): KvDefinition;
	set(definition: KvDefinition): void;
	delete(): boolean;
	observe(callback: (definition: KvDefinition) => void): () => void;
};

function createKvHelper(
	kvMap: KvDefinitionYMap,
	kvEntryMap: Y.Map<unknown>,
	keyName: string,
): KvHelper {
	return {
		toJSON() {
			return {
				name: (kvEntryMap.get('name') as string) ?? '',
				icon: (kvEntryMap.get('icon') as IconDefinition | null) ?? null,
				description: (kvEntryMap.get('description') as string) ?? '',
				field: kvEntryMap.get('field'),
			} as KvDefinition;
		},

		set(definition) {
			kvEntryMap.set('name', definition.name);
			kvEntryMap.set('icon', definition.icon);
			kvEntryMap.set('description', definition.description);
			kvEntryMap.set('field', definition.field);
		},

		delete() {
			if (!kvMap.has(keyName)) return false;
			kvMap.delete(keyName);
			return true;
		},

		observe(callback) {
			const handler = () => {
				callback(this.toJSON());
			};
			kvEntryMap.observeDeep(handler);
			return () => kvEntryMap.unobserveDeep(handler);
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// KV Collection (callable with properties)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable collection for KV definitions.
 *
 * Call with a key name to get a KvHelper, or use properties for bulk operations.
 *
 * @example
 * ```typescript
 * // Get a specific KV helper
 * const theme = definition.kv('theme');
 *
 * // Bulk operations
 * definition.kv.toJSON();      // all KV definitions as JSON
 * definition.kv.keys();        // ['theme', 'fontSize', ...]
 * definition.kv.set('count', setting({ ... }));
 * definition.kv.observe(cb);
 * ```
 */
export type KvCollection = {
	(keyName: string): KvHelper | undefined;
	toJSON(): Record<string, KvDefinition>;
	keys(): string[];
	set(keyName: string, definition: KvDefinition): void;
	observe(callback: (changes: Map<string, ChangeAction>) => void): () => void;
};

function createKvCollection(definitionMap: DefinitionMap): KvCollection {
	const getKvMap = (): KvDefinitionYMap | null => {
		return (definitionMap.get('kv') as KvDefinitionYMap) ?? null;
	};

	const getOrCreateKvMap = (): KvDefinitionYMap => {
		let kvMap = definitionMap.get('kv') as KvDefinitionYMap | undefined;
		if (!kvMap) {
			kvMap = new Y.Map() as KvDefinitionYMap;
			definitionMap.set('kv', kvMap);
		}
		return kvMap;
	};

	// Cache for KV helpers
	const kvHelperCache = new Map<string, KvHelper>();

	const kvAccessor = (keyName: string): KvHelper | undefined => {
		const kvMap = getKvMap();
		if (!kvMap) return undefined;

		const kvEntryMap = kvMap.get(keyName);
		if (!kvEntryMap) return undefined;

		let helper = kvHelperCache.get(keyName);
		if (!helper) {
			helper = createKvHelper(kvMap, kvEntryMap, keyName);
			kvHelperCache.set(keyName, helper);
		}
		return helper;
	};

	return Object.assign(kvAccessor, {
		toJSON(): Record<string, KvDefinition> {
			const kvMap = getKvMap();
			if (!kvMap) return {};

			const result: Record<string, KvDefinition> = {};
			for (const [keyName, kvEntryMap] of kvMap.entries()) {
				result[keyName] = {
					name: (kvEntryMap.get('name') as string) ?? '',
					icon: (kvEntryMap.get('icon') as IconDefinition | null) ?? null,
					description: (kvEntryMap.get('description') as string) ?? '',
					field: kvEntryMap.get('field'),
				} as KvDefinition;
			}
			return result;
		},

		keys(): string[] {
			const kvMap = getKvMap();
			if (!kvMap) return [];
			return Array.from(kvMap.keys());
		},

		set(keyName: string, definition: KvDefinition): void {
			const kvMap = getOrCreateKvMap();

			let kvEntryMap = kvMap.get(keyName);
			if (!kvEntryMap) {
				kvEntryMap = new Y.Map();
				kvMap.set(keyName, kvEntryMap);
			}

			kvEntryMap.set('name', definition.name);
			kvEntryMap.set('icon', definition.icon);
			kvEntryMap.set('description', definition.description);
			kvEntryMap.set('field', definition.field);

			kvHelperCache.delete(keyName);
		},

		observe(
			callback: (changes: Map<string, ChangeAction>) => void,
		): () => void {
			const handler = (event: Y.YMapEvent<Y.Map<unknown>>) => {
				const changes = new Map<string, ChangeAction>();
				event.changes.keys.forEach((change, key) => {
					if (change.action === 'add' || change.action === 'delete') {
						changes.set(key, change.action);
					}
				});
				if (changes.size > 0) callback(changes);
			};

			const kvMap = getOrCreateKvMap();
			kvMap.observe(handler);
			return () => kvMap.unobserve(handler);
		},
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Definition Helper (main export)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Definition helper for managing workspace table and KV definitions.
 *
 * Uses the **Callable Collection Pattern**: collections are functions that return
 * item helpers when called with a key, with additional properties for bulk operations.
 *
 * ## API Overview
 *
 * ```
 * definition
 * ├── .toJSON()                       → WorkspaceDefinitionMap
 * ├── .merge({ tables?, kv? })        → void
 * ├── .observe(cb)                    → unsubscribe
 * │
 * ├── .tables(name)                   → TableHelper | undefined
 * ├── .tables.toJSON()                → Record<string, TableDefinition>
 * ├── .tables.keys()                  → string[]
 * ├── .tables.set(name, def)          → void
 * └── .tables.observe(cb)             → unsubscribe
 *
 * definition.tables('posts')          → TableHelper
 * ├── .toJSON()                       → TableDefinition
 * ├── .set(def)                       → void
 * ├── .delete()                       → boolean
 * ├── .observe(cb)                    → unsubscribe
 * ├── .fields(name)                   → FieldHelper | undefined
 * ├── .fields.toJSON()                → Record<string, FieldSchema>
 * └── .metadata.toJSON()              → { name, icon, description }
 * ```
 *
 * @example
 * ```typescript
 * const definition = createDefinition(definitionMap);
 *
 * // Check if table exists (no .has() needed)
 * if (definition.tables('posts')) {
 *   console.log('posts table exists');
 * }
 *
 * // Get table definition as JSON
 * const posts = definition.tables('posts')?.toJSON();
 *
 * // Add a field to existing table
 * definition.tables('posts')?.fields.set('dueDate', date());
 *
 * // Get a specific field
 * const title = definition.tables('posts')?.fields('title')?.toJSON();
 *
 * // Update field
 * definition.tables('posts')?.fields('title')?.set(text({ default: 'Untitled' }));
 *
 * // Delete a field
 * definition.tables('posts')?.fields('title')?.delete();
 * ```
 */
export function createDefinition(definitionMap: DefinitionMap) {
	const tables = createTablesCollection(definitionMap);
	const kv = createKvCollection(definitionMap);

	return {
		/**
		 * Serialize the entire definition to a plain JSON object.
		 */
		toJSON(): WorkspaceDefinitionMap {
			return definitionMap.toJSON() as WorkspaceDefinitionMap;
		},

		/**
		 * Merge definitions into the workspace.
		 * Existing definitions not in the payload are preserved.
		 */
		merge(input: {
			tables?: Record<string, TableDefinition>;
			kv?: Record<string, KvDefinition>;
		}): void {
			if (input.tables) {
				for (const [tableName, tableDefinition] of Object.entries(
					input.tables,
				)) {
					tables.set(tableName, tableDefinition);
				}
			}
			if (input.kv) {
				for (const [keyName, kvDefinition] of Object.entries(input.kv)) {
					kv.set(keyName, kvDefinition);
				}
			}
		},

		/**
		 * Observe any definition changes (tables or KV).
		 * Uses observeDeep to catch all nested changes.
		 */
		observe(callback: () => void): () => void {
			definitionMap.observeDeep(callback);
			return () => definitionMap.unobserveDeep(callback);
		},

		/** Table definition operations. */
		tables,

		/** KV definition operations. */
		kv,
	};
}

export type Definition = ReturnType<typeof createDefinition>;
