import * as Y from 'yjs';
import type { CellValue, Row, TableSchema } from './column-schemas';

/**
 * YJS representation of a row
 * Maps column names to YJS shared types or primitives
 */
type YjsRowData = Y.Map<CellValue>;

/**
 * Observer handlers for table changes
 */
type ObserveHandlers<TRow extends Row> = {
	onAdd: (id: string, data: TRow) => void | Promise<void>;
	onUpdate: (id: string, data: TRow) => void | Promise<void>;
	onDelete: (id: string) => void | Promise<void>;
};

/**
 * Type-safe table helper with operations for a specific table schema
 */
export type TableHelper<TRow extends Row> = {
	insert(data: TRow): void;
	update(id: string, partial: Partial<TRow>): void;
	upsert(data: TRow): void;
	insertMany(rows: TRow[]): void;
	upsertMany(rows: TRow[]): void;
	updateMany(updates: Array<{ id: string; data: Partial<TRow> }>): void;
	get(id: string): TRow | undefined;
	getMany(ids: string[]): TRow[];
	getAll(): TRow[];
	has(id: string): boolean;
	delete(id: string): void;
	deleteMany(ids: string[]): void;
	clear(): void;
	count(): number;
	observe(handlers: ObserveHandlers<TRow>): () => void;
	filter(predicate: (row: TRow) => boolean): TRow[];
	find(predicate: (row: TRow) => boolean): TRow | undefined;
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
 * // Insert a new row (errors if ID already exists)
 * doc.tables.posts.insert({
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
 * // Update partial fields (errors if row doesn't exist)
 * doc.tables.posts.update('1', { title: 'Updated Title', viewCount: 100 });
 *
 * // Upsert - insert or update (never errors)
 * doc.tables.posts.upsert({
 *   id: '2',
 *   title: 'Post 2',
 *   content: null,
 *   tags: new Y.Array(),
 *   viewCount: 0,
 *   published: false
 * });
 *
 * const exists = doc.tables.posts.has('1');
 * doc.tables.posts.delete('1');
 *
 * // Batch operations (transactional)
 * const content2 = new Y.XmlFragment();
 * const tags2 = new Y.Array<string>();
 * tags2.push(['tech']);
 *
 * doc.tables.posts.insertMany([
 *   { id: '3', title: 'Post 3', content: null, tags: new Y.Array(), viewCount: 0, published: false },
 *   { id: '4', title: 'Post 4', content: content2, tags: tags2, viewCount: 10, published: true },
 * ]);
 *
 * doc.tables.posts.upsertMany([
 *   { id: '3', title: 'Updated Post 3', content: null, tags: new Y.Array(), viewCount: 5, published: false },
 *   { id: '5', title: 'Post 5', content: null, tags: new Y.Array(), viewCount: 0, published: false },
 * ]);
 *
 * doc.tables.posts.updateMany([
 *   { id: '3', data: { viewCount: 10 } },
 *   { id: '4', data: { published: false } },
 * ]);
 *
 * const rows = doc.tables.posts.getMany(['3', '4']);
 * doc.tables.posts.deleteMany(['3', '4']);
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
 *   doc.tables.posts.upsert({ id: '1', title: 'Hello', content: newContent, tags: newTags, viewCount: 0, published: false });
 *   doc.tables.comments.insert({ id: '1', postId: '1', text: 'Great post!' });
 * }, 'bulk-import');
 * ```
 */
export function createYjsDocument<TSchemas extends Record<string, TableSchema>>(
	workspaceId: string,
	tableSchemas: TSchemas,
) {
	// Initialize Y.Doc
	const ydoc = new Y.Doc({ guid: workspaceId });
	const ytables = ydoc.getMap<Y.Map<YjsRowData>>('tables');

	// Initialize each table as a Y.Map<id, row>
	for (const tableName of Object.keys(tableSchemas)) {
		ytables.set(tableName, new Y.Map<YjsRowData>());
	}

	return {
		/**
		 * Table helpers organized by table name
		 * Each table has methods for type-safe CRUD operations
		 */
		tables: Object.fromEntries(
			Object.keys(tableSchemas).map((tableName) => {
				const ytable = ytables.get(tableName);
				if (!ytable) {
					throw new Error(`Table "${tableName}" not found in YJS document`);
				}

				const tableHelper = {
					insert(data: Row) {
						ydoc.transact(() => {
							const id = data.id as string;
							if (ytable.has(id)) {
								throw new Error(
									`Row with id "${id}" already exists in table "${tableName}"`,
								);
							}
							const ymap = new Y.Map<CellValue>();
							for (const [key, value] of Object.entries(data)) {
								ymap.set(key, value);
							}
							ytable.set(id, ymap);
						});
					},

					update(id: string, partial: Partial<Row>) {
						ydoc.transact(() => {
							const ymap = ytable.get(id);
							if (!ymap) {
								throw new Error(
									`Row with id "${id}" not found in table "${tableName}"`,
								);
							}
							for (const [key, value] of Object.entries(partial)) {
								ymap.set(key, value);
							}
						});
					},

					upsert(data: Row) {
						ydoc.transact(() => {
							const id = data.id as string;
							let ymap = ytable.get(id);
							if (!ymap) {
								ymap = new Y.Map<CellValue>();
								ytable.set(id, ymap);
							}
							for (const [key, value] of Object.entries(data)) {
								ymap.set(key, value);
							}
						});
					},

					insertMany(rows: Row[]) {
						ydoc.transact(() => {
							for (const row of rows) {
								const id = row.id as string;
								if (ytable.has(id)) {
									throw new Error(
										`Row with id "${id}" already exists in table "${tableName}"`,
									);
								}
								const ymap = new Y.Map<CellValue>();
								for (const [key, value] of Object.entries(row)) {
									ymap.set(key, value);
								}
								ytable.set(id, ymap);
							}
						});
					},

					upsertMany(rows: Row[]) {
						ydoc.transact(() => {
							for (const row of rows) {
								const id = row.id as string;
								let ymap = ytable.get(id);
								if (!ymap) {
									ymap = new Y.Map<CellValue>();
									ytable.set(id, ymap);
								}
								for (const [key, value] of Object.entries(row)) {
									ymap.set(key, value);
								}
							}
						});
					},

					updateMany(updates: Array<{ id: string; data: Partial<Row> }>) {
						ydoc.transact(() => {
							for (const { id, data } of updates) {
								const ymap = ytable.get(id);
								if (!ymap) {
									throw new Error(
										`Row with id "${id}" not found in table "${tableName}"`,
									);
								}
								for (const [key, value] of Object.entries(data)) {
									ymap.set(key, value);
								}
							}
						});
					},

					get(id: string) {
						const ymap = ytable.get(id);
						if (!ymap) return undefined;
						return Object.fromEntries(ymap.entries()) as Row;
					},

					getMany(ids: string[]) {
						const rows: Row[] = [];
						for (const id of ids) {
							const ymap = ytable.get(id);
							if (ymap) {
								rows.push(Object.fromEntries(ymap.entries()) as Row);
							}
						}
						return rows;
					},

					getAll() {
						const rows: Row[] = [];
						for (const ymap of ytable.values()) {
							rows.push(Object.fromEntries(ymap.entries()) as Row);
						}
						return rows;
					},

					has(id: string) {
						return ytable.has(id);
					},

					delete(id: string) {
						ydoc.transact(() => {
							ytable.delete(id);
						});
					},

					deleteMany(ids: string[]) {
						ydoc.transact(() => {
							for (const id of ids) {
								ytable.delete(id);
							}
						});
					},

					clear() {
						ydoc.transact(() => {
							ytable.clear();
						});
					},

					count() {
						return ytable.size;
					},

					observe(handlers: ObserveHandlers<Row>) {
						// Use observeDeep to catch nested changes (fields inside rows)
						const observer = (events: Y.YEvent<any>[]) => {
							for (const event of events) {
								event.changes.keys.forEach((change: any, key: string) => {
									if (change.action === 'add') {
										const ymap = ytable.get(key);
										if (ymap) {
											const data = Object.fromEntries(ymap.entries()) as Row;
											handlers.onAdd(key, data);
										}
									} else if (change.action === 'update') {
										const ymap = ytable.get(key);
										if (ymap) {
											const data = Object.fromEntries(ymap.entries()) as Row;
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

					filter(predicate: (row: Row) => boolean) {
						const results: Row[] = [];
						for (const ymap of ytable.values()) {
							const row = Object.fromEntries(ymap.entries()) as Row;
							if (predicate(row)) {
								results.push(row);
							}
						}
						return results;
					},

					find(predicate: (row: Row) => boolean) {
						for (const ymap of ytable.values()) {
							const row = Object.fromEntries(ymap.entries()) as Row;
							if (predicate(row)) {
								return row;
							}
						}
						return undefined;
					},
				} satisfies TableHelper<Row>;

				return [tableName, tableHelper];
			}),
		) as {
			[TTableName in keyof TSchemas]: TableHelper<Row<TSchemas[TTableName]>>;
		},

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
		 * doc.tables.posts.insert({ id: '1', title: 'Hello', ... });
		 *
		 * // Batch operation - wrapped in transaction
		 * doc.tables.posts.insertMany([{ id: '1', ... }, { id: '2', ... }]);
		 *
		 * // Cross-table transaction - safe nesting
		 * doc.transact(() => {
		 *   doc.tables.posts.upsertMany([...]); // reuses outer transaction
		 *   doc.tables.users.insert({ ... }); // also reuses outer transaction
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
			return Object.keys(tableSchemas);
		},
	};
}
