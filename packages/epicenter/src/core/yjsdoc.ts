import * as Y from 'yjs';
import type {
	CellValue,
	DateWithTimezone,
	RowData,
	TableSchema,
} from './column-schemas';
import { Serializer } from './columns';

/**
 * YJS document utilities for vault.
 * Handles initialization, conversion, and observation of YJS documents.
 */

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
type YjsRowData = Y.Map<CellValue>;

/**
 * Observer handlers for table changes
 */
type ObserveHandlers<S extends TableSchema> = {
	onAdd: (id: string, data: RowData<S>) => void | Promise<void>;
	onUpdate: (id: string, data: RowData<S>) => void | Promise<void>;
	onDelete: (id: string) => void | Promise<void>;
};

/**
 * Type-safe table helper with operations for a specific table schema
 */
type TableHelper<S extends TableSchema> = {
	set(data: RowData<S>): void;
	setMany(rows: RowData<S>[]): void;
	get(id: string): RowData<S> | undefined;
	getMany(ids: string[]): RowData<S>[];
	getAll(): RowData<S>[];
	has(id: string): boolean;
	delete(id: string): void;
	deleteMany(ids: string[]): void;
	clear(): void;
	count(): number;
	observe(handlers: ObserveHandlers<S>): () => void;
	filter(predicate: (row: RowData<S>) => boolean): RowData<S>[];
	find(predicate: (row: RowData<S>) => boolean): RowData<S> | undefined;
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
 * // Define schemas with type inference
 * const doc = createYjsDocument('workspace-id', {
 *   posts: {
 *     id: id(),
 *     title: text(),
 *     content: richText({ nullable: true }),
 *     tags: multiSelect({ options: ['tech', 'personal', 'work'] as const }),
 *     viewCount: integer(),
 *     published: boolean(),
 *   },
 *   comments: {
 *     id: id(),
 *     postId: text(),
 *     text: text(),
 *   }
 * });
 *
 * // Create YJS types directly
 * const content = new Y.XmlFragment();
 * const paragraph = new Y.XmlElement('p');
 * const textNode = new Y.XmlText();
 * textNode.insert(0, 'Hello World');
 * paragraph.insert(0, [textNode]);
 * content.insert(0, [paragraph]);
 *
 * const tags = new Y.Array<string>();
 * tags.push(['tech', 'personal']);
 *
 * // Type-safe table operations with YJS types
 * doc.tables.posts.set({
 *   id: '1',
 *   title: 'My First Post',
 *   content: content,      // Y.XmlFragment instance
 *   tags: tags,            // Y.Array instance
 *   viewCount: 0,
 *   published: false
 * }); // All fields are typed and required
 *
 * // Typed return values with YJS types
 * const row = doc.tables.posts.get('1');
 * // row: { id: string; title: string; content: Y.XmlFragment | null; tags: Y.Array<string>; viewCount: number; published: boolean } | undefined
 *
 * // Mutations work because YJS types are passed by reference
 * if (row) {
 *   row.content?.insert(0, [new Y.XmlElement('p')]); // ✅ Mutates the document
 *   row.tags.push(['work']);                          // ✅ Mutates the document
 *
 *   // Observe individual field changes
 *   row.content?.observe((event) => {
 *     console.log('Content changed:', event.changes);
 *   });
 * }
 *
 * const exists = doc.tables.posts.has('1');
 * doc.tables.posts.delete('1');
 *
 * // Batch operations (transactional)
 * const content2 = new Y.XmlFragment();
 * const tags2 = new Y.Array<string>();
 * tags2.push(['tech']);
 *
 * doc.tables.posts.setMany([
 *   { id: '1', title: 'Post 1', content: null, tags: new Y.Array(), viewCount: 0, published: false },
 *   { id: '2', title: 'Post 2', content: content2, tags: tags2, viewCount: 10, published: true },
 * ]);
 * const rows = doc.tables.posts.getMany(['1', '2']);
 * doc.tables.posts.deleteMany(['1', '2']);
 *
 * // Bulk operations
 * const allRows = doc.tables.posts.getAll(); // Array<{ id: string; title: string; content: Y.XmlFragment | null; ... }>
 * const count = doc.tables.posts.count();
 * doc.tables.posts.clear();
 *
 * // Typed observation
 * const unsubscribe = doc.tables.posts.observe({
 *   onAdd: (id, data) => {
 *     // data is typed: { id: string; title: string; content: Y.XmlFragment | null; tags: Y.Array<string>; viewCount: number; published: boolean }
 *     console.log(`Post ${data.title} added`);
 *     data.content?.observe(() => console.log('Content modified'));
 *   },
 *   onUpdate: (id, data) => console.log(`Post ${id} updated`),
 *   onDelete: (id) => console.log(`Post ${id} deleted`),
 * });
 *
 * // Typed filtering
 * const publishedPosts = doc.tables.posts.filter(post => post.published);
 * const firstDraft = doc.tables.posts.find(post => !post.published);
 *
 * // Document utilities
 * doc.transact(() => {
 *   const newContent = new Y.XmlFragment();
 *   const newTags = new Y.Array<string>();
 *   newTags.push(['tech']);
 *   doc.tables.posts.set({ id: '1', title: 'Hello', content: newContent, tags: newTags, viewCount: 0, published: false });
 *   doc.tables.comments.set({ id: '1', postId: '1', text: 'Great post!' });
 * }, 'bulk-import');
 * ```
 */
export function createYjsDocument<
	TTableSchemas extends Record<string, TableSchema>,
>(workspaceId: string, tableSchemas: TTableSchemas) {
	// Initialize Y.Doc
	const ydoc = new Y.Doc({ guid: workspaceId });
	const ytables = ydoc.getMap<Y.Map<YjsRowData>>('tables');

	// Initialize each table as a Y.Map<id, row>
	for (const tableName of Object.keys(tableSchemas)) {
		ytables.set(tableName, new Y.Map<YjsRowData>());
	}

	/**
	 * Row serializer for converting between plain RowData objects and Y.Map YJS structures
	 */
	const RowSerializer = Serializer({
		serialize(value: RowData<TableSchema>): YjsRowData {
			const ymap = new Y.Map();
			for (const [key, val] of Object.entries(value)) {
				ymap.set(key, val);
			}
			return ymap as YjsRowData;
		},

		deserialize(ymap: YjsRowData): RowData<TableSchema> {
			const obj = {} as RowData<TableSchema>;
			for (const [key, value] of ymap.entries()) {
				obj[key] = value;
			}
			return obj;
		},
	});

	/**
	 * Factory function to create a table helper for a specific table
	 * Encapsulates all CRUD operations for a single table
	 */
	const createTableHelper = <K extends keyof TTableSchemas>(
		tableName: K,
		ytable: Y.Map<YjsRowData>,
	): TableHelper<TTableSchemas[K]> => ({
		set(data: RowData<TTableSchemas[K]>): void {
			const ymap = RowSerializer.serialize(data as RowData<TableSchema>);
			ydoc.transact(() => {
				ytable.set(data.id as string, ymap);
			});
		},

		setMany(rows: RowData<TTableSchemas[K]>[]): void {
			ydoc.transact(() => {
				for (const row of rows) {
					const ymap = RowSerializer.serialize(row as RowData<TableSchema>);
					ytable.set(row.id as string, ymap);
				}
			});
		},

		get(id: string): RowData<TTableSchemas[K]> | undefined {
			const ymap = ytable.get(id);
			if (!ymap) return undefined;
			return RowSerializer.deserialize(ymap) as RowData<TTableSchemas[K]>;
		},

		getMany(ids: string[]): RowData<TTableSchemas[K]>[] {
			const rows: RowData<TTableSchemas[K]>[] = [];
			for (const id of ids) {
				const ymap = ytable.get(id);
				if (ymap) {
					rows.push(
						RowSerializer.deserialize(ymap) as RowData<TTableSchemas[K]>,
					);
				}
			}
			return rows;
		},

		getAll(): RowData<TTableSchemas[K]>[] {
			const rows: RowData<TTableSchemas[K]>[] = [];
			for (const [id, ymap] of ytable.entries()) {
				rows.push(RowSerializer.deserialize(ymap) as RowData<TTableSchemas[K]>);
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

		observe(handlers: ObserveHandlers<TTableSchemas[K]>): () => void {
			// Use observeDeep to catch nested changes (fields inside rows)
			const observer = (events: Y.YEvent<any>[]) => {
				for (const event of events) {
					event.changes.keys.forEach((change: any, key: string) => {
						if (change.action === 'add') {
							const ymap = ytable.get(key);
							if (ymap) {
								const data = RowSerializer.deserialize(ymap) as RowData<
									TTableSchemas[K]
								>;
								handlers.onAdd(key, data);
							}
						} else if (change.action === 'update') {
							const ymap = ytable.get(key);
							if (ymap) {
								const data = RowSerializer.deserialize(ymap) as RowData<
									TTableSchemas[K]
								>;
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

		filter(
			predicate: (row: RowData<TTableSchemas[K]>) => boolean,
		): RowData<TTableSchemas[K]>[] {
			const results: RowData<TTableSchemas[K]>[] = [];
			for (const [id, ymap] of ytable.entries()) {
				const row = RowSerializer.deserialize(ymap) as RowData<
					TTableSchemas[K]
				>;
				if (predicate(row)) {
					results.push(row);
				}
			}
			return results;
		},

		find(
			predicate: (row: RowData<TTableSchemas[K]>) => boolean,
		): RowData<TTableSchemas[K]> | undefined {
			for (const [id, ymap] of ytable.entries()) {
				const row = RowSerializer.deserialize(ymap) as RowData<
					TTableSchemas[K]
				>;
				if (predicate(row)) {
					return row;
				}
			}
			return undefined;
		},
	});

	// Create table helpers for each table
	const tables = Object.fromEntries(
		Object.keys(tableSchemas).map((tableName) => {
			const ytable = ytables.get(tableName);
			if (!ytable) {
				throw new Error(`Table "${tableName}" not found in YJS document`);
			}
			return [
				tableName,
				createTableHelper(tableName as keyof TTableSchemas, ytable),
			];
		}),
	) as { [K in keyof TTableSchemas]: TableHelper<TTableSchemas[K]> };

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
