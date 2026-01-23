import * as Y from 'yjs';
import type {
	DefinitionMap,
	WorkspaceDefinitionMap,
} from '../docs/workspace-doc';
import type {
	FieldSchema,
	FieldSchemaMap,
	IconDefinition,
	KvFieldSchema,
} from '../schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Y.Map storing table definitions, keyed by table name. */
export type TablesDefinitionMap = Y.Map<Y.Map<unknown>>;

/** Y.Map storing KV definitions, keyed by key name. */
export type KvDefinitionMap = Y.Map<Y.Map<unknown>>;

/** Y.Map storing fields for a single table, keyed by field name. */
export type FieldsMap = Y.Map<FieldSchema>;

/**
 * Input type for setting a table definition.
 * Allows optional metadata fields (icon, description) that will default.
 */
export type TableDefinitionInput = {
	name: string;
	icon?: IconDefinition | null;
	description?: string;
	fields: FieldSchemaMap;
};

/**
 * Input type for setting a KV definition.
 * Allows optional metadata fields (icon, description) that will default.
 */
export type KvDefinitionInput = {
	name: string;
	icon?: IconDefinition | null;
	description?: string;
	field: KvFieldSchema;
};

/** Change action for nested Y.Map observation. */
export type ChangeAction = 'add' | 'delete';

/** Change action for leaf Y.Map observation (fields can be updated). */
export type FieldChangeAction = 'add' | 'update' | 'delete';

/** Table metadata (name, icon, description). */
export type TableMetadata = {
	name: string;
	icon: IconDefinition | null;
	description: string;
};

/** Stored table definition in Y.Map format. */
export type StoredTableDefinition = {
	name: string;
	icon: IconDefinition | null;
	description: string;
	fields: Record<string, FieldSchema>;
};

/** Stored KV definition in Y.Map format. */
export type StoredKvDefinition = {
	name: string;
	icon: IconDefinition | null;
	description: string;
	field: FieldSchema;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Fields sub-helper for a single table
// ─────────────────────────────────────────────────────────────────────────────

function createFieldsHelper(
	tableDefinitionMap: Y.Map<unknown>,
	_tableName: string,
) {
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

	return {
		/**
		 * Get a field schema by name.
		 *
		 * @example
		 * ```typescript
		 * const titleSchema = definition.tables.posts.fields.get('title');
		 * if (titleSchema) {
		 *   console.log(titleSchema.type); // 'text'
		 * }
		 * ```
		 */
		get(fieldName: string): FieldSchema | undefined {
			return getFieldsMap()?.get(fieldName);
		},

		/**
		 * Get all field schemas for this table.
		 *
		 * @example
		 * ```typescript
		 * const fields = definition.tables.posts.fields.getAll();
		 * for (const [name, schema] of Object.entries(fields)) {
		 *   console.log(name, schema.type);
		 * }
		 * ```
		 */
		getAll(): Record<string, FieldSchema> {
			const fieldsMap = getFieldsMap();
			if (!fieldsMap) return {};
			return fieldsMap.toJSON() as Record<string, FieldSchema>;
		},

		/**
		 * Set (add or update) a field schema.
		 *
		 * @example
		 * ```typescript
		 * // Add a new field
		 * definition.tables.posts.fields.set('dueDate', date({ nullable: true }));
		 *
		 * // Update an existing field
		 * definition.tables.posts.fields.set('title', text({ default: 'Untitled' }));
		 * ```
		 */
		set(fieldName: string, fieldSchema: FieldSchema): void {
			getOrCreateFieldsMap().set(fieldName, fieldSchema);
		},

		/**
		 * Delete a field from the table schema.
		 *
		 * Note: This only removes the schema definition. Existing data in the
		 * table is not affected (the column data remains, just becomes untyped).
		 *
		 * @example
		 * ```typescript
		 * definition.tables.posts.fields.delete('dueDate');
		 * ```
		 */
		delete(fieldName: string): boolean {
			const fieldsMap = getFieldsMap();
			if (!fieldsMap || !fieldsMap.has(fieldName)) return false;
			fieldsMap.delete(fieldName);
			return true;
		},

		/**
		 * Check if a field exists in the table schema.
		 */
		has(fieldName: string): boolean {
			return getFieldsMap()?.has(fieldName) ?? false;
		},

		/**
		 * Get all field names.
		 */
		keys(): string[] {
			const fieldsMap = getFieldsMap();
			if (!fieldsMap) return [];
			return Array.from(fieldsMap.keys());
		},

		/**
		 * Observe changes to fields in this table.
		 *
		 * Notifies which field keys changed and how. Consumer calls `.get(key)` to retrieve values.
		 *
		 * @example
		 * ```typescript
		 * definition.tables.posts.fields.observe((changes) => {
		 *   for (const [fieldName, action] of changes) {
		 *     if (action === 'add' || action === 'update') {
		 *       const field = definition.tables('posts')?.fields.get(fieldName);
		 *       console.log(`Field ${action}: ${fieldName}`, field);
		 *     } else {
		 *       console.log(`Field deleted: ${fieldName}`);
		 *     }
		 *   }
		 * });
		 * ```
		 */
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
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Metadata sub-helper for a single table
// ─────────────────────────────────────────────────────────────────────────────

function createMetadataHelper(tableDefinitionMap: Y.Map<unknown>) {
	return {
		/**
		 * Get table metadata (name, icon, description).
		 *
		 * @example
		 * ```typescript
		 * const meta = definition.tables.posts.metadata.get();
		 * console.log(meta.name); // 'Posts'
		 * ```
		 */
		get(): TableMetadata {
			return {
				name: (tableDefinitionMap.get('name') as string) ?? '',
				icon: (tableDefinitionMap.get('icon') as IconDefinition | null) ?? null,
				description: (tableDefinitionMap.get('description') as string) ?? '',
			};
		},

		/**
		 * Set table metadata. Only provided fields are updated.
		 *
		 * @example
		 * ```typescript
		 * definition.tables.posts.metadata.set({ name: 'Blog Posts' });
		 * definition.tables.posts.metadata.set({ icon: { type: 'emoji', value: '📝' } });
		 * ```
		 */
		set(metadata: Partial<TableMetadata>): void {
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

		/**
		 * Observe changes to table metadata.
		 */
		observe(callback: (metadata: TableMetadata) => void): () => void {
			const handler = () => {
				callback(this.get());
			};
			tableDefinitionMap.observe(handler);
			return () => tableDefinitionMap.unobserve(handler);
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Per-table definition helper
// ─────────────────────────────────────────────────────────────────────────────

function createTableDefinitionHelper(
	tableDefinitionMap: Y.Map<unknown>,
	tableName: string,
) {
	return {
		/**
		 * Get the full table definition.
		 */
		get(): StoredTableDefinition {
			return {
				name: (tableDefinitionMap.get('name') as string) ?? '',
				icon: (tableDefinitionMap.get('icon') as IconDefinition | null) ?? null,
				description: (tableDefinitionMap.get('description') as string) ?? '',
				fields:
					((
						tableDefinitionMap.get('fields') as Y.Map<FieldSchema>
					)?.toJSON() as Record<string, FieldSchema>) ?? {},
			};
		},

		/**
		 * Field schema operations for this table.
		 */
		fields: createFieldsHelper(tableDefinitionMap, tableName),

		/**
		 * Table metadata operations (name, icon, description).
		 */
		metadata: createMetadataHelper(tableDefinitionMap),
	};
}

export type TableDefinitionHelper = ReturnType<
	typeof createTableDefinitionHelper
>;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Tables schema collection helper (callable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callable function type for accessing table schema helpers.
 *
 * The definition.tables object is callable: `definition.tables('posts')` returns a TableDefinitionHelper.
 * It also has properties for utility methods: `definition.tables.get()`, `definition.tables.set()`, etc.
 */
export type TablesDefinitionHelper = {
	// Call signature
	(tableName: string): TableDefinitionHelper | undefined;

	// Properties
	get(tableName: string): StoredTableDefinition | undefined;
	getAll(): Record<string, StoredTableDefinition>;
	set(tableName: string, definition: TableDefinitionInput): void;
	delete(tableName: string): boolean;
	has(tableName: string): boolean;
	keys(): string[];
	observe(callback: (changes: Map<string, ChangeAction>) => void): () => void;
};

function createTablesDefinitionHelper(
	definitionMap: DefinitionMap,
): TablesDefinitionHelper {
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

	// Cache for per-table helpers (created lazily)
	const tableHelperCache = new Map<string, TableDefinitionHelper>();

	const getTableHelper = (
		tableName: string,
	): TableDefinitionHelper | undefined => {
		const tablesMap = getTablesMap();
		if (!tablesMap) return undefined;

		const tableDefinitionMap = tablesMap.get(tableName);
		if (!tableDefinitionMap) return undefined;

		// Check cache first
		let helper = tableHelperCache.get(tableName);
		if (!helper) {
			helper = createTableDefinitionHelper(tableDefinitionMap, tableName);
			tableHelperCache.set(tableName, helper);
		}
		return helper;
	};

	// ════════════════════════════════════════════════════════════════════
	// BUILD CALLABLE FUNCTION WITH PROPERTIES
	// ════════════════════════════════════════════════════════════════════

	/**
	 * The main accessor function. Call with a table name to get a per-table helper.
	 *
	 * Returns undefined if the table doesn't exist.
	 *
	 * @example
	 * ```typescript
	 * const postsHelper = definition.tables('posts');
	 * if (postsHelper) {
	 *   postsHelper.fields.set('dueDate', date());
	 *   postsHelper.metadata.set({ name: 'Blog Posts' });
	 * }
	 * ```
	 */
	const tablesAccessor = (
		tableName: string,
	): TableDefinitionHelper | undefined => {
		return getTableHelper(tableName);
	};

	// Build the callable function with properties
	// NOTE: We use Object.assign for methods but defineProperty for getters
	// because Object.assign evaluates getters immediately (which would create
	// the tables Y.Map eagerly, breaking the "empty schema" test case).
	const result = Object.assign(tablesAccessor, {
		/**
		 * Get a table's schema by name (as a snapshot, not a helper).
		 *
		 * @example
		 * ```typescript
		 * const postsSchema = definition.tables.get('posts');
		 * ```
		 */
		get(tableName: string): StoredTableDefinition | undefined {
			const tablesMap = getTablesMap();
			if (!tablesMap) return undefined;

			const tableDefinitionMap = tablesMap.get(tableName);
			if (!tableDefinitionMap) return undefined;

			return {
				name: (tableDefinitionMap.get('name') as string) ?? '',
				icon: (tableDefinitionMap.get('icon') as IconDefinition | null) ?? null,
				description: (tableDefinitionMap.get('description') as string) ?? '',
				fields:
					((
						tableDefinitionMap.get('fields') as Y.Map<FieldSchema>
					)?.toJSON() as Record<string, FieldSchema>) ?? {},
			};
		},

		/**
		 * Get all table schemas.
		 *
		 * @example
		 * ```typescript
		 * const allTables = definition.tables.getAll();
		 * for (const [name, schema] of Object.entries(allTables)) {
		 *   console.log(name, schema.fields);
		 * }
		 * ```
		 */
		getAll(): Record<string, StoredTableDefinition> {
			const tablesMap = getTablesMap();
			if (!tablesMap) return {};

			const result: Record<string, StoredTableDefinition> = {};
			for (const [tableName, tableDefinitionMap] of tablesMap.entries()) {
				result[tableName] = {
					name: (tableDefinitionMap.get('name') as string) ?? '',
					icon:
						(tableDefinitionMap.get('icon') as IconDefinition | null) ?? null,
					description: (tableDefinitionMap.get('description') as string) ?? '',
					fields:
						((
							tableDefinitionMap.get('fields') as Y.Map<FieldSchema>
						)?.toJSON() as Record<string, FieldSchema>) ?? {},
				};
			}
			return result;
		},

		/**
		 * Set (add or update) a table schema.
		 *
		 * Icon and description are optional and will default to null and '' respectively.
		 *
		 * @example
		 * ```typescript
		 * definition.tables.set('tasks', {
		 *   name: 'Tasks',
		 *   icon: { type: 'emoji', value: '✅' },
		 *   description: 'Project tasks',
		 *   fields: { id: id(), title: text() },
		 * });
		 *
		 * // Minimal form (icon and description optional)
		 * definition.tables.set('posts', {
		 *   name: 'Posts',
		 *   fields: { id: id(), title: text() },
		 * });
		 * ```
		 */
		set(tableName: string, definition: TableDefinitionInput): void {
			const tablesMap = getOrCreateTablesMap();

			let tableDefinitionMap = tablesMap.get(tableName);
			if (!tableDefinitionMap) {
				tableDefinitionMap = new Y.Map();
				tablesMap.set(tableName, tableDefinitionMap);
			}

			tableDefinitionMap.set('name', definition.name);
			tableDefinitionMap.set('icon', definition.icon ?? null);
			tableDefinitionMap.set('description', definition.description ?? '');

			// Set fields
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

			// Clear cache entry so it gets recreated with new map
			tableHelperCache.delete(tableName);
		},

		/**
		 * Delete a table schema.
		 *
		 * Note: This only removes the schema definition. Existing data in the
		 * table is not affected.
		 */
		delete(tableName: string): boolean {
			const tablesMap = getTablesMap();
			if (!tablesMap || !tablesMap.has(tableName)) return false;
			tablesMap.delete(tableName);
			tableHelperCache.delete(tableName);
			return true;
		},

		/**
		 * Check if a table schema exists.
		 */
		has(tableName: string): boolean {
			return getTablesMap()?.has(tableName) ?? false;
		},

		/**
		 * Get all table names.
		 */
		keys(): string[] {
			const tablesMap = getTablesMap();
			if (!tablesMap) return [];
			return Array.from(tablesMap.keys());
		},

		/**
		 * Observe changes to table schemas (add/delete tables).
		 *
		 * Notifies which table keys changed and how. Consumer calls `.get(key)` to retrieve values.
		 *
		 * @example
		 * ```typescript
		 * definition.tables.observe((changes) => {
		 *   for (const [tableName, action] of changes) {
		 *     if (action === 'add') {
		 *       const table = definition.tables.get(tableName);
		 *       console.log(`Table added: ${tableName}`, table);
		 *     } else {
		 *       console.log(`Table deleted: ${tableName}`);
		 *     }
		 *   }
		 * });
		 * ```
		 */
		observe(
			callback: (changes: Map<string, ChangeAction>) => void,
		): () => void {
			const handler = (event: Y.YMapEvent<Y.Map<unknown>>) => {
				const changes = new Map<string, ChangeAction>();
				event.changes.keys.forEach((change, key) => {
					// Tables Y.Map only has 'add' and 'delete' (nested Y.Maps don't fire 'update')
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

	return result as TablesDefinitionHelper;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: KV schema collection helper
// ─────────────────────────────────────────────────────────────────────────────

function createKvDefinitionHelper(definitionMap: DefinitionMap) {
	const getKvMap = (): KvDefinitionMap | null => {
		return (definitionMap.get('kv') as KvDefinitionMap) ?? null;
	};

	const getOrCreateKvMap = (): KvDefinitionMap => {
		let kvMap = definitionMap.get('kv') as KvDefinitionMap | undefined;
		if (!kvMap) {
			kvMap = new Y.Map() as KvDefinitionMap;
			definitionMap.set('kv', kvMap);
		}
		return kvMap;
	};

	return {
		/**
		 * Get a KV key's schema by name.
		 *
		 * @example
		 * ```typescript
		 * const themeSchema = definition.kv.get('theme');
		 * ```
		 */
		get(keyName: string): StoredKvDefinition | undefined {
			const kvMap = getKvMap();
			if (!kvMap) return undefined;

			const kvEntryMap = kvMap.get(keyName);
			if (!kvEntryMap) return undefined;

			return {
				name: (kvEntryMap.get('name') as string) ?? '',
				icon: (kvEntryMap.get('icon') as IconDefinition | null) ?? null,
				description: (kvEntryMap.get('description') as string) ?? '',
				field: kvEntryMap.get('field') as FieldSchema,
			};
		},

		/**
		 * Get all KV schemas.
		 *
		 * @example
		 * ```typescript
		 * const allKv = definition.kv.getAll();
		 * for (const [name, def] of Object.entries(allKv)) {
		 *   console.log(name, def.field.type);
		 * }
		 * ```
		 */
		getAll(): Record<string, StoredKvDefinition> {
			const kvMap = getKvMap();
			if (!kvMap) return {};

			const result: Record<string, StoredKvDefinition> = {};
			for (const [keyName, kvEntryMap] of kvMap.entries()) {
				result[keyName] = {
					name: (kvEntryMap.get('name') as string) ?? '',
					icon: (kvEntryMap.get('icon') as IconDefinition | null) ?? null,
					description: (kvEntryMap.get('description') as string) ?? '',
					field: kvEntryMap.get('field') as FieldSchema,
				};
			}
			return result;
		},

		/**
		 * Set (add or update) a KV schema.
		 *
		 * Icon and description are optional and will default to null and '' respectively.
		 *
		 * @example
		 * ```typescript
		 * definition.kv.set('theme', {
		 *   name: 'Theme',
		 *   icon: { type: 'emoji', value: '🎨' },
		 *   description: 'Application color theme',
		 *   field: select({ options: ['light', 'dark'], default: 'light' }),
		 * });
		 *
		 * // Minimal form (icon and description optional)
		 * definition.kv.set('count', {
		 *   name: 'Count',
		 *   field: integer({ default: 0 }),
		 * });
		 * ```
		 */
		set(keyName: string, definition: KvDefinitionInput): void {
			const kvMap = getOrCreateKvMap();

			let kvEntryMap = kvMap.get(keyName);
			if (!kvEntryMap) {
				kvEntryMap = new Y.Map();
				kvMap.set(keyName, kvEntryMap);
			}

			kvEntryMap.set('name', definition.name);
			kvEntryMap.set('icon', definition.icon ?? null);
			kvEntryMap.set('description', definition.description ?? '');
			kvEntryMap.set('field', definition.field);
		},

		/**
		 * Delete a KV schema.
		 *
		 * Note: This only removes the schema definition. The actual value
		 * stored in KV is not affected.
		 */
		delete(keyName: string): boolean {
			const kvMap = getKvMap();
			if (!kvMap || !kvMap.has(keyName)) return false;
			kvMap.delete(keyName);
			return true;
		},

		/**
		 * Check if a KV schema exists.
		 */
		has(keyName: string): boolean {
			return getKvMap()?.has(keyName) ?? false;
		},

		/**
		 * Get all KV key names.
		 */
		keys(): string[] {
			const kvMap = getKvMap();
			if (!kvMap) return [];
			return Array.from(kvMap.keys());
		},

		/**
		 * Observe changes to KV schemas (add/delete keys).
		 *
		 * Notifies which KV keys changed and how. Consumer calls `.get(key)` to retrieve values.
		 *
		 * @example
		 * ```typescript
		 * definition.kv.observe((changes) => {
		 *   for (const [kvName, action] of changes) {
		 *     if (action === 'add') {
		 *       const kv = definition.kv.get(kvName);
		 *       console.log(`KV added: ${kvName}`, kv);
		 *     } else {
		 *       console.log(`KV deleted: ${kvName}`);
		 *     }
		 *   }
		 * });
		 * ```
		 */
		observe(
			callback: (changes: Map<string, ChangeAction>) => void,
		): () => void {
			const handler = (event: Y.YMapEvent<Y.Map<unknown>>) => {
				const changes = new Map<string, ChangeAction>();
				event.changes.keys.forEach((change, key) => {
					// KV Y.Map only has 'add' and 'delete' (nested Y.Maps don't fire 'update')
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
	};
}

export type KvDefinitionHelper = ReturnType<typeof createKvDefinitionHelper>;

// ─────────────────────────────────────────────────────────────────────────────
// Main: Definition helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a definition helper for managing workspace definition.
 *
 * The definition helper provides typed CRUD operations for table and KV definitions,
 * with granular field-level operations for Notion-like dynamic definition editing.
 *
 * @param definitionMap - The Y.Map storing the workspace definition
 *
 * @example
 * ```typescript
 * const definition = createDefinition(definitionMap);
 *
 * // Add a new table
 * definition.tables.set('tasks', {
 *   name: 'Tasks',
 *   fields: { id: id(), title: text() },
 * });
 *
 * // Add a column to existing table
 * definition.tables.table('tasks')?.fields.set('dueDate', date());
 *
 * // Update table metadata
 * definition.tables.table('tasks')?.metadata.set({ name: 'My Tasks' });
 *
 * // Add a KV setting
 * definition.kv.set('theme', {
 *   name: 'Theme',
 *   field: select({ options: ['light', 'dark'] }),
 * });
 * ```
 */
export function createDefinition(definitionMap: DefinitionMap) {
	return {
		/**
		 * Get the entire definition as a snapshot (plain object).
		 *
		 * @example
		 * ```typescript
		 * const snapshot = definition.get();
		 * console.log(snapshot.tables, snapshot.kv);
		 * ```
		 */
		get(): WorkspaceDefinitionMap {
			return definitionMap.toJSON() as WorkspaceDefinitionMap;
		},

		/**
		 * Merge definitions into the workspace.
		 *
		 * This is a bulk operation that adds/updates multiple tables and KV keys.
		 * Existing definitions not in the merge payload are preserved.
		 *
		 * @example
		 * ```typescript
		 * definition.merge({
		 *   tables: {
		 *     posts: table({ name: 'Posts', fields: { id: id(), title: text() } }),
		 *     users: table({ name: 'Users', fields: { id: id(), name: text() } }),
		 *   },
		 *   kv: {
		 *     theme: { name: 'Theme', field: select({ options: ['light', 'dark'] }) },
		 *   },
		 * });
		 * ```
		 */
		merge(input: {
			tables?: Record<string, TableDefinitionInput>;
			kv?: Record<string, KvDefinitionInput>;
		}): void {
			if (input.tables) {
				for (const [tableName, tableDefinition] of Object.entries(
					input.tables,
				)) {
					this.tables.set(tableName, tableDefinition);
				}
			}

			if (input.kv) {
				for (const [keyName, kvDefinition] of Object.entries(input.kv)) {
					this.kv.set(keyName, kvDefinition);
				}
			}
		},

		/**
		 * Observe any definition changes (tables or KV).
		 *
		 * Uses observeDeep to catch all nested changes. Just notifies that something changed;
		 * consumer calls `definition.get()` to retrieve the current state.
		 *
		 * @example
		 * ```typescript
		 * definition.observe(() => {
		 *   const snapshot = definition.get();
		 *   console.log('Definition changed:', snapshot);
		 * });
		 * ```
		 */
		observe(callback: () => void): () => void {
			definitionMap.observeDeep(callback);
			return () => definitionMap.unobserveDeep(callback);
		},

		/**
		 * Table definition operations.
		 */
		tables: createTablesDefinitionHelper(definitionMap),

		/**
		 * KV definition operations.
		 */
		kv: createKvDefinitionHelper(definitionMap),
	};
}

export type Definition = ReturnType<typeof createDefinition>;
