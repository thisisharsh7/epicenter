import * as Y from 'yjs';
import type { DateWithTimezone, TableSchema } from './column-schemas';
import { Serializer } from './columns';

/**
 * YJS document utilities for vault.
 * Handles initialization, conversion, and observation of YJS documents.
 */

/**
 * A single cell value in its plain JavaScript form
 */
type CellValue =
	| string // id, text, rich-text (as string), select
	| number // integer, real
	| boolean // boolean
	| DateWithTimezone // date with timezone
	| string[] // multi-select (strings)
	| number[] // multi-select (numbers)
	| null; // nullable fields

/**
 * A single cell value in its YJS form
 */
type YjsCellValue =
	| Y.Text // rich-text
	| Y.Array<string> // multi-select (string arrays)
	| Y.Array<number> // potential number arrays
	| string // id, text, select
	| number // integer, real
	| boolean // boolean
	| DateWithTimezone // date with timezone
	| null; // nullable fields

/**
 * A row of data with typed cell values
 */
export type RowData = Record<string, CellValue>;

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
type YjsRowData = Y.Map<YjsCellValue>;

/**
 * Observer handlers for table changes
 */
type ObserveHandlers = {
	onAdd: (id: string, data: RowData) => void | Promise<void>;
	onUpdate: (id: string, data: RowData) => void | Promise<void>;
	onDelete: (id: string) => void | Promise<void>;
};

/**
 * Table helper methods for a single table
 * Provides CRUD operations without needing to pass table name
 */
type TableHelper = {
	// Single row operations
	set(data: RowData): void;
	get(id: string): RowData | undefined;
	has(id: string): boolean;
	delete(id: string): void;

	// Batch operations (transactional)
	setMany(rows: RowData[]): void;
	getMany(ids: string[]): RowData[];
	deleteMany(ids: string[]): void;

	// Bulk operations
	getAll(): RowData[];
	clear(): void;
	count(): number;

	// Observation
	observe(handlers: ObserveHandlers): () => void;
};

/**
 * Create a YJS document for a workspace with encapsulated state.
 * Returns an object with namespaced table methods and document utilities.
 *
 * All methods accept and return plain JavaScript objects - YJS conversion
 * is handled automatically internally.
 *
 * Creates the structure:
 *   ydoc
 *     └─ tables (Y.Map<Y.Map<YjsRowData>>)
 *         └─ tableName (Y.Map<Y.Map<YjsValue>>)
 *
 * Each table is directly a Y.Map<Y.Map<YjsValue>> where:
 * - Keys are row IDs (string)
 * - Values are Y.Map<YjsValue> representing each row
 *
 * @example
 * ```typescript
 * const doc = createYjsDocument('workspace-id', { posts: { id: id(), ... } });
 *
 * // Table operations (namespaced)
 * doc.tables.posts.set({ id: '1', title: 'Hello' });
 * const row = doc.tables.posts.get('1');
 * const exists = doc.tables.posts.has('1');
 * doc.tables.posts.delete('1');
 *
 * // Batch operations (transactional)
 * doc.tables.posts.setMany([{ id: '1', ... }, { id: '2', ... }]);
 * const rows = doc.tables.posts.getMany(['1', '2']);
 * doc.tables.posts.deleteMany(['1', '2']);
 *
 * // Bulk operations
 * const allRows = doc.tables.posts.getAll();
 * const count = doc.tables.posts.count();
 * doc.tables.posts.clear();
 *
 * // Observation
 * const unsubscribe = doc.tables.posts.observe({ onAdd, onUpdate, onDelete });
 *
 * // Document utilities
 * doc.transact(() => {
 *   doc.tables.posts.set({ ... });
 *   doc.tables.comments.set({ ... });
 * }, 'bulk-import');
 * ```
 */
export function createYjsDocument<T extends Record<string, TableSchema>>(
	workspaceId: string,
	tableSchemas: T,
) {
	// Reserved names that cannot be used for tables
	const RESERVED_NAMES = ['tables', 'ydoc', 'transact', 'getTableNames'];

	// Validate table names
	for (const tableName of Object.keys(tableSchemas)) {
		if (RESERVED_NAMES.includes(tableName)) {
			throw new Error(
				`Table name "${tableName}" is reserved. Reserved names: ${RESERVED_NAMES.join(', ')}`,
			);
		}
	}

	// Initialize Y.Doc
	const ydoc = new Y.Doc({ guid: workspaceId });
	const ytables = ydoc.getMap<Y.Map<YjsRowData>>('tables');

	// Initialize each table as a Y.Map<id, row>
	for (const tableName of Object.keys(tableSchemas)) {
		ytables.set(tableName, new Y.Map<YjsRowData>());
	}

	/**
	 * Serializer for converting between plain CellValue and YJS CellValue
	 * Handles conversion of rich-text strings to Y.Text and array unwrapping
	 */
	const CellSerializer = (columnType: string) => {
		return Serializer({
			serialize(value: CellValue): YjsCellValue {
				if (columnType === 'rich-text' && typeof value === 'string') {
					return new Y.Text(value);
				}
				return value as YjsCellValue;
			},

			deserialize(value: YjsCellValue): CellValue {
				if (value instanceof Y.Text) {
					return value.toString();
				}
				if (value instanceof Y.Array) {
					return value.toArray();
				}
				return value;
			},
		});
	};

	/**
	 * Factory function to create a row serializer for a specific table
	 * Serializes between plain RowData objects and Y.Map YJS structures
	 */
	const RowSerializer = (tableName: string) => {
		const columnSchemas = tableSchemas[tableName];

		return Serializer({
			serialize(value: RowData): YjsRowData {
				const ymap = new Y.Map();

				for (const [key, val] of Object.entries(value)) {
					const schema = columnSchemas[key];
					const cellSerializer = CellSerializer(schema.type);
					ymap.set(key, cellSerializer.serialize(val));
				}

				return ymap as YjsRowData;
			},

			deserialize(ymap: YjsRowData): RowData {
				const obj: RowData = {};

				for (const [key, value] of ymap.entries()) {
					const schema = columnSchemas[key];
					const cellSerializer = CellSerializer(schema.type);
					obj[key] = cellSerializer.deserialize(value);
				}

				return obj;
			},
		});
	};

	/**
	 * Factory function to create a table helper for a specific table
	 * Encapsulates all CRUD operations for a single table
	 */
	const createTableHelper = (
		tableName: string,
		ytable: Y.Map<YjsRowData>,
	): TableHelper => ({
		set(data: RowData): void {
			const ymap = RowSerializer(tableName).serialize(data);
			ydoc.transact(() => {
				ytable.set(data.id as string, ymap);
			});
		},

		setMany(rows: RowData[]): void {
			ydoc.transact(() => {
				for (const row of rows) {
					const ymap = RowSerializer(tableName).serialize(row);
					ytable.set(row.id as string, ymap);
				}
			});
		},

		get(id: string): RowData | undefined {
			const rowMap = ytable.get(id);
			if (!rowMap) return undefined;
			return RowSerializer(tableName).deserialize(rowMap);
		},

		getMany(ids: string[]): RowData[] {
			const rows: RowData[] = [];
			for (const id of ids) {
				const rowMap = ytable.get(id);
				if (rowMap) {
					rows.push(RowSerializer(tableName).deserialize(rowMap));
				}
			}
			return rows;
		},

		getAll(): RowData[] {
			const rows: RowData[] = [];
			for (const [id, rowMap] of ytable.entries()) {
				rows.push(RowSerializer(tableName).deserialize(rowMap));
			}
			return rows;
		},

		has(id: string): boolean {
			return ytable.has(id);
		},

		delete(id: string): void {
			ydoc.transact(() => {
				ytable.delete(id);
			});
		},

		deleteMany(ids: string[]): void {
			ydoc.transact(() => {
				for (const id of ids) {
					ytable.delete(id);
				}
			});
		},

		clear(): void {
			ydoc.transact(() => {
				ytable.clear();
			});
		},

		count(): number {
			return ytable.size;
		},

		observe(handlers: ObserveHandlers): () => void {
			// Use observeDeep to catch nested changes (fields inside rows)
			const observer = (events: Y.YEvent<any>[]) => {
				for (const event of events) {
					event.changes.keys.forEach((change: any, key: string) => {
						if (change.action === 'add') {
							const rowMap = ytable.get(key);
							if (rowMap) {
								const data = RowSerializer(tableName).deserialize(rowMap);
								handlers.onAdd(key, data);
							}
						} else if (change.action === 'update') {
							const rowMap = ytable.get(key);
							if (rowMap) {
								const data = RowSerializer(tableName).deserialize(rowMap);
								handlers.onUpdate(key, data);
							}
						} else if (change.action === 'delete') {
							handlers.onDelete(key);
						}
					});
				}
			};

			ytable.observeDeep(observer);

			// Return unsubscribe function
			return () => {
				ytable.unobserveDeep(observer);
			};
		},
	});

	// Create table helpers for each table
	const tables = Object.fromEntries(
		Object.keys(tableSchemas).map((tableName) => {
			const ytable = ytables.get(tableName);
			if (!ytable) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}
			return [tableName, createTableHelper(tableName, ytable)];
		}),
	) as { [K in keyof T]: TableHelper };

	return {
		/**
		 * Table helpers organized by table name
		 * Each table has methods for CRUD operations
		 */
		tables,

		/**
		 * The underlying YJS document
		 * Exposed for persistence and sync providers
		 */
		ydoc,

		/**
		 * Execute a function within a YJS transaction
		 *
		 * Transactions bundle changes and ensure atomic updates. All changes within
		 * a transaction are sent as a single update to collaborators.
		 *
		 * **Nested Transactions:**
		 * YJS handles nested transact() calls safely by reusing the outer transaction.
		 *
		 * - First transact() creates a transaction (sets doc._transaction, initialCall = true)
		 * - Nested transact() calls check if doc._transaction exists and reuse it
		 * - Inner transact() calls are essentially no-ops - they just execute their function
		 * - Only the outermost transaction (where initialCall = true) triggers cleanup and events
		 *
		 * This means it's safe to:
		 * - Call table methods inside a transaction (they use transact internally)
		 * - Nest transactions for cross-table operations
		 *
		 * @example
		 * ```typescript
		 * // Single operation - automatically transactional
		 * doc.tables.posts.set({ id: '1', title: 'Hello' });
		 *
		 * // Batch operation - wrapped in transaction
		 * doc.tables.posts.setMany([{ id: '1', ... }, { id: '2', ... }]);
		 *
		 * // Cross-table transaction - safe nesting
		 * doc.transact(() => {
		 *   doc.tables.posts.setMany([...]); // reuses outer transaction
		 *   doc.tables.users.set({ ... }); // also reuses outer transaction
		 * }, 'bulk-import');
		 * ```
		 */
		transact(fn: () => void, origin?: string): void {
			ydoc.transact(fn, origin);
		},

		/**
		 * Get all table names in the document
		 */
		getTableNames(): string[] {
			return Object.keys(tables);
		},
	};
}
