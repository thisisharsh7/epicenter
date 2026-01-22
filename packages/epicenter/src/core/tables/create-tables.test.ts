import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { boolean, id, integer, richtext, table, tags, text } from '../schema';
import { createTables } from './create-tables';

describe('createTables', () => {
	test('should create and retrieve rows correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: table({
				name: '',
				description: '',
				fields: {
					id: id(),
					title: text(),
					view_count: integer(),
					published: boolean(),
				},
			}),
		});

		// Create a row
		doc('posts').upsert({
			id: '1',
			title: 'Test Post',
			view_count: 0,
			published: false,
		});

		// Retrieve the row
		const result = doc('posts').get('1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row.title).toBe('Test Post');
			expect(result.row.view_count).toBe(0);
			expect(result.row.published).toBe(false);
		}
	});

	test('should handle batch operations', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: table({
				name: '',
				description: '',
				fields: {
					id: id(),
					title: text(),
					view_count: integer(),
					published: boolean(),
				},
			}),
		});

		// Create multiple rows
		doc('posts').upsertMany([
			{ id: '1', title: 'Post 1', view_count: 10, published: true },
			{ id: '2', title: 'Post 2', view_count: 20, published: false },
		]);

		// Retrieve and verify rows
		const row1 = doc('posts').get('1');
		const row2 = doc('posts').get('2');
		expect(row1.status).toBe('valid');
		expect(row2.status).toBe('valid');
		if (row1.status === 'valid') {
			expect(row1.row.title).toBe('Post 1');
		}
		if (row2.status === 'valid') {
			expect(row2.row.title).toBe('Post 2');
		}
	});

	test('should filter and find rows correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: table({
				name: '',
				description: '',
				fields: {
					id: id(),
					title: text(),
					view_count: integer(),
					published: boolean(),
				},
			}),
		});

		doc('posts').upsertMany([
			{ id: '1', title: 'Post 1', view_count: 10, published: true },
			{ id: '2', title: 'Post 2', view_count: 20, published: false },
			{ id: '3', title: 'Post 3', view_count: 30, published: true },
		]);

		// Filter published posts
		const publishedPosts = doc('posts').filter((post) => post.published);
		expect(publishedPosts).toHaveLength(2);

		// Find first unpublished post
		const firstDraft = doc('posts').find((post) => !post.published);
		expect(firstDraft).not.toBeNull();
		if (firstDraft) {
			expect(firstDraft.id).toBe('2');
		}
	});

	test('should return not_found status for non-existent rows', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: table({
				name: '',
				description: '',
				fields: {
					id: id(),
					title: text(),
					view_count: integer(),
					published: boolean(),
				},
			}),
		});

		// Test get() with non-existent id
		const getResult = doc('posts').get('non-existent');
		expect(getResult.status).toBe('not_found');
		if (getResult.status === 'not_found') {
			expect(getResult.id).toBe('non-existent');
		}

		// Test find() with no matches
		const findResult = doc('posts').find((post) => post.id === 'non-existent');
		expect(findResult).toBeNull();
	});

	test('should store and retrieve richtext and tags correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: table({
				name: '',
				description: '',
				fields: {
					id: id(),
					title: richtext(),
					tags: tags({ options: ['typescript', 'javascript', 'python'] }),
				},
			}),
		});

		doc('posts').upsert({
			id: '1',
			title: 'rtxt_hello123',
			tags: ['typescript', 'javascript'],
		});

		const result1 = doc('posts').get('1');
		expect(result1.status).toBe('valid');
		if (result1.status === 'valid') {
			expect(result1.row.title).toBe('rtxt_hello123');
			expect(result1.row.tags).toEqual(['typescript', 'javascript']);
		}

		doc('posts').upsert({
			id: '2',
			title: 'rtxt_second456',
			tags: ['python'],
		});

		const rows = doc('posts').getAllValid();
		expect(rows).toHaveLength(2);
		const firstRow = rows[0]!;
		const secondRow = rows[1]!;
		expect(firstRow.title).toBe('rtxt_hello123');
		expect(secondRow.title).toBe('rtxt_second456');
	});

	test('rows are plain JSON-serializable objects', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: table({
				name: '',
				description: '',
				fields: {
					id: id(),
					title: text(),
					published: boolean(),
				},
			}),
		});

		doc('posts').upsert({ id: '1', title: 'Test', published: false });

		const result = doc('posts').get('1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			const row = result.row;
			expect(row).toEqual({ id: '1', title: 'Test', published: false });

			const serialized = JSON.stringify(row);
			const parsed = JSON.parse(serialized);
			expect(parsed).toEqual({ id: '1', title: 'Test', published: false });
		}
	});

	describe('observe', () => {
		test('onAdd fires when row is added via upsert', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
						published: boolean(),
					},
				}),
			});

			const addedRows: string[] = [];
			tables('posts').observe((changes) => {
				for (const [id, action] of changes) {
					if (action === 'add') {
						addedRows.push(id);
					}
				}
			});

			tables('posts').upsert({
				id: 'post-1',
				title: 'First',
				published: false,
			});
			tables('posts').upsert({
				id: 'post-2',
				title: 'Second',
				published: true,
			});

			expect(addedRows).toEqual(['post-1', 'post-2']);
		});

		test('onUpdate fires when row field is modified', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
						view_count: integer(),
					},
				}),
			});

			tables('posts').upsert({
				id: 'post-1',
				title: 'Original',
				view_count: 0,
			});

			const updates: Array<{ id: string; title: string }> = [];
			tables('posts').observe((changes) => {
				for (const [id, action] of changes) {
					if (action === 'update') {
						const result = tables('posts').get(id);
						if (result.status === 'valid') {
							updates.push({
								id,
								title: result.row.title,
							});
						}
					}
				}
			});

			tables('posts').update({ id: 'post-1', title: 'Updated' });
			tables('posts').update({ id: 'post-1', view_count: 100 });

			expect(updates).toHaveLength(2);
			expect(updates[0]?.title).toBe('Updated');
		});

		test('onDelete fires when row is removed', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			tables('posts').upsert({ id: 'post-1', title: 'First' });
			tables('posts').upsert({ id: 'post-2', title: 'Second' });

			const deletedIds: string[] = [];
			tables('posts').observe((changes) => {
				for (const [id, action] of changes) {
					if (action === 'delete') {
						deletedIds.push(id);
					}
				}
			});

			tables('posts').delete('post-1');

			expect(deletedIds).toEqual(['post-1']);
		});

		test('callbacks receive raw row data', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			const receivedRows: Array<{ id: string; title: string }> = [];

			tables('posts').observe((changes) => {
				for (const [id, action] of changes) {
					if (action === 'add') {
						const result = tables('posts').get(id);
						if (result.status === 'valid') {
							receivedRows.push({ id, title: result.row.title });
						}
					}
				}
			});

			tables('posts').upsert({ id: 'post-1', title: 'Test' });

			expect(receivedRows).toHaveLength(1);
			expect(receivedRows[0]).toEqual({ id: 'post-1', title: 'Test' });
		});

		test('raw values passed through even for invalid data', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			type RowMap = Y.Map<unknown>;
			type TableMap = Y.Map<RowMap>;
			type TablesMap = Y.Map<TableMap>;

			const ytables: TablesMap = ydoc.getMap('tables');

			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						count: integer(),
					},
				}),
			});

			let receivedResult: unknown = null;
			tables('posts').observe((changes) => {
				for (const [id, action] of changes) {
					if (action === 'add') {
						receivedResult = tables('posts').get(id);
					}
				}
			});

			let postsTable = ytables.get('posts');
			if (!postsTable) {
				postsTable = new Y.Map() as TableMap;
				ytables.set('posts', postsTable);
			}

			const rowMap = new Y.Map() as RowMap;
			postsTable.set('bad-row', rowMap);
			// Set all values in a transaction so the observer fires once with complete data
			ydoc.transact(() => {
				rowMap.set('id', 'bad-row');
				rowMap.set('count', 'not a number');
			});

			expect(receivedResult).toMatchObject({
				status: 'invalid',
				row: { id: 'bad-row', count: 'not a number' },
			});
		});

		test('unsubscribe stops callbacks', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			const addedIds: string[] = [];
			const unsubscribe = tables('posts').observe((changes) => {
				for (const [id, action] of changes) {
					if (action === 'add') {
						addedIds.push(id);
					}
				}
			});

			tables('posts').upsert({ id: 'post-1', title: 'First' });
			unsubscribe();
			tables('posts').upsert({ id: 'post-2', title: 'Second' });

			expect(addedIds).toEqual(['post-1']);
		});

		test('transaction batching: upsertMany fires callback once with all changes', () => {
			const ydoc = new Y.Doc({ guid: 'test-batch' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			let callbackCount = 0;
			const allChanges: Map<string, string>[] = [];

			tables('posts').observe((changes) => {
				callbackCount++;
				const changeMap = new Map<string, string>();
				for (const [id, action] of changes) {
					changeMap.set(id, action);
				}
				allChanges.push(changeMap);
			});

			tables('posts').upsertMany([
				{ id: 'post-1', title: 'First' },
				{ id: 'post-2', title: 'Second' },
				{ id: 'post-3', title: 'Third' },
			]);

			expect(callbackCount).toBe(1);
			expect(allChanges[0]?.size).toBe(3);
			expect(allChanges[0]?.get('post-1')).toBe('add');
			expect(allChanges[0]?.get('post-2')).toBe('add');
			expect(allChanges[0]?.get('post-3')).toBe('add');
		});

		test('transaction batching: multiple updates in transact fires callback once', () => {
			const ydoc = new Y.Doc({ guid: 'test-batch-update' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
						view_count: integer(),
					},
				}),
			});

			tables('posts').upsertMany([
				{ id: 'post-1', title: 'First', view_count: 0 },
				{ id: 'post-2', title: 'Second', view_count: 0 },
			]);

			let callbackCount = 0;
			const allChanges: Map<string, string>[] = [];

			tables('posts').observe((changes) => {
				callbackCount++;
				const changeMap = new Map<string, string>();
				for (const [id, action] of changes) {
					changeMap.set(id, action);
				}
				allChanges.push(changeMap);
			});

			ydoc.transact(() => {
				tables('posts').update({ id: 'post-1', title: 'Updated First' });
				tables('posts').update({ id: 'post-2', title: 'Updated Second' });
			});

			expect(callbackCount).toBe(1);
			expect(allChanges[0]?.size).toBe(2);
			expect(allChanges[0]?.get('post-1')).toBe('update');
			expect(allChanges[0]?.get('post-2')).toBe('update');
		});

		test('transaction batching: mixed operations in transact fires callback once', () => {
			const ydoc = new Y.Doc({ guid: 'test-batch-mixed' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			tables('posts').upsert({ id: 'post-1', title: 'First' });

			let callbackCount = 0;
			let lastChanges: Map<string, string> = new Map();

			tables('posts').observe((changes) => {
				callbackCount++;
				lastChanges = new Map();
				for (const [id, action] of changes) {
					lastChanges.set(id, action);
				}
			});

			ydoc.transact(() => {
				tables('posts').update({ id: 'post-1', title: 'Updated' });
				tables('posts').upsert({ id: 'post-2', title: 'New' });
				tables('posts').delete('post-1');
			});

			expect(callbackCount).toBe(1);
			expect(lastChanges.get('post-1')).toBe('delete');
			expect(lastChanges.get('post-2')).toBe('add');
		});

		test('transaction batching: deleteMany fires callback once', () => {
			const ydoc = new Y.Doc({ guid: 'test-batch-delete' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			tables('posts').upsertMany([
				{ id: 'post-1', title: 'First' },
				{ id: 'post-2', title: 'Second' },
				{ id: 'post-3', title: 'Third' },
			]);

			let callbackCount = 0;
			let lastChanges: Map<string, string> = new Map();

			tables('posts').observe((changes) => {
				callbackCount++;
				lastChanges = new Map();
				for (const [id, action] of changes) {
					lastChanges.set(id, action);
				}
			});

			tables('posts').deleteMany(['post-1', 'post-2']);

			expect(callbackCount).toBe(1);
			expect(lastChanges.size).toBe(2);
			expect(lastChanges.get('post-1')).toBe('delete');
			expect(lastChanges.get('post-2')).toBe('delete');
		});

		test('same-row dedupe: multiple updates in one transaction emits final value', () => {
			const ydoc = new Y.Doc({ guid: 'test-dedupe' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
						view_count: integer(),
					},
				}),
			});

			tables('posts').upsert({
				id: 'post-1',
				title: 'Original',
				view_count: 0,
			});

			let callbackCount = 0;
			type ChangeRecord = {
				action: string;
				title?: string;
				view_count?: number;
			};
			let lastChange: ChangeRecord | null = null;

			tables('posts').observe((changes) => {
				callbackCount++;
				const action = changes.get('post-1');
				if (action === 'update') {
					const result = tables('posts').get('post-1');
					if (result.status === 'valid') {
						lastChange = {
							action,
							title: result.row.title,
							view_count: result.row.view_count,
						};
					}
				}
			});

			ydoc.transact(() => {
				tables('posts').update({ id: 'post-1', title: 'First Update' });
				tables('posts').update({ id: 'post-1', title: 'Second Update' });
				tables('posts').update({ id: 'post-1', view_count: 100 });
			});

			expect(callbackCount).toBe(1);
			expect(lastChange).not.toBeNull();
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const change = lastChange!;
			expect(change.action).toBe('update');
			expect(change.title).toBe('Second Update');
			expect(change.view_count).toBe(100);
		});

		test('empty row deleted before first cell change emits only delete', () => {
			const ydoc = new Y.Doc({ guid: 'test-empty-row-delete' });
			type RowMap = Y.Map<unknown>;
			type TableMap = Y.Map<RowMap>;
			type TablesMap = Y.Map<TableMap>;

			const ytables: TablesMap = ydoc.getMap('tables');

			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			const changes: Array<{ action: string; id: string }> = [];
			tables('posts').observe((changeMap) => {
				for (const [rowId, action] of changeMap) {
					changes.push({ action, id: rowId });
				}
			});

			let postsTable = ytables.get('posts');
			if (!postsTable) {
				postsTable = new Y.Map() as TableMap;
				ytables.set('posts', postsTable);
			}

			const emptyRowMap = new Y.Map() as RowMap;
			postsTable.set('empty-row', emptyRowMap);

			postsTable.delete('empty-row');

			expect(changes).toHaveLength(1);
			expect(changes[0]).toEqual({ action: 'delete', id: 'empty-row' });
		});

		test('observer isolation: changes in other tables do not trigger callback', () => {
			const ydoc = new Y.Doc({ guid: 'test-isolation' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
				comments: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						content: text(),
					},
				}),
			});

			const postsChanges: string[] = [];
			tables('posts').observe((changes) => {
				for (const [rowId] of changes) {
					postsChanges.push(rowId);
				}
			});

			tables('comments').upsert({ id: 'comment-1', content: 'Hello' });
			tables('comments').update({ id: 'comment-1', content: 'Updated' });
			tables('comments').delete('comment-1');

			expect(postsChanges).toHaveLength(0);

			tables('posts').upsert({ id: 'post-1', title: 'Test' });
			expect(postsChanges).toContain('post-1');
		});

		test('callback fires after transaction completes, not during', () => {
			const ydoc = new Y.Doc({ guid: 'test-timing' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			tables('posts').upsert({ id: 'post-1', title: 'Original' });

			let callbackCalled = false;

			tables('posts').observe(() => {
				callbackCalled = true;
			});

			ydoc.transact(() => {
				tables('posts').update({ id: 'post-1', title: 'Updated' });
				expect(callbackCalled).toBe(false);
			});

			expect(callbackCalled).toBe(true);
		});

		test('multiple subscribers receive same changes', () => {
			const ydoc = new Y.Doc({ guid: 'test-multi-sub' });
			const tables = createTables(ydoc, {
				posts: table({
					name: '',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			const subscriber1Changes: string[] = [];
			const subscriber2Changes: string[] = [];

			const unsub1 = tables('posts').observe((changes) => {
				for (const [rowId] of changes) {
					subscriber1Changes.push(rowId);
				}
			});

			const unsub2 = tables('posts').observe((changes) => {
				for (const [rowId] of changes) {
					subscriber2Changes.push(rowId);
				}
			});

			tables('posts').upsert({ id: 'post-1', title: 'Test' });

			expect(subscriber1Changes).toEqual(['post-1']);
			expect(subscriber2Changes).toEqual(['post-1']);

			unsub1();

			tables('posts').upsert({ id: 'post-2', title: 'Second' });

			expect(subscriber1Changes).toEqual(['post-1']);
			expect(subscriber2Changes).toEqual(['post-1', 'post-2']);

			unsub2();
		});
	});

	describe('dynamic table access', () => {
		test('table() returns typed helper for defined tables', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			// Access via table() should work the same as direct access
			tables('posts').upsert({ id: '1', title: 'Hello' });
			const result = tables('posts').get('1');
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.title).toBe('Hello');
			}

			// Same as direct access
			expect(tables('posts').count()).toBe(tables('posts').count());
		});

		test('table() returns untyped helper for undefined tables', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			// Access a table not in schema
			const customTable = tables('custom_data');
			customTable.upsert({ id: '1', foo: 'bar', count: 42 });

			const result = customTable.get('1');
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.foo).toBe('bar');
				expect(result.row.count).toBe(42);
			}
		});

		test('table() creates the same helper instance on repeated calls', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			// Defined table
			expect(tables('posts')).toBe(tables('posts'));

			// Dynamic table (should cache the helper)
			const helper1 = tables('dynamic');
			const helper2 = tables('dynamic');
			expect(helper1).toBe(helper2);
		});

		test('has() checks existence without creating table', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			// Initially no tables exist in YJS
			expect(tables.has('posts')).toBe(false);
			expect(tables.has('custom')).toBe(false);

			// After upsert, table exists
			tables('posts').upsert({ id: '1', title: 'Hello' });
			expect(tables.has('posts')).toBe(true);
			expect(tables.has('custom')).toBe(false);

			// After dynamic upsert
			tables('custom').upsert({ id: '1', data: 'test' });
			expect(tables.has('custom')).toBe(true);
		});
	});

	describe('iteration methods', () => {
		test('all() returns helpers for all tables in YJS', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
				users: table({
					name: 'Users',
					description: '',
					fields: {
						id: id(),
						name: text(),
					},
				}),
			});

			// Initially empty
			expect(tables.all()).toHaveLength(0);

			// After creating some data
			tables('posts').upsert({ id: '1', title: 'Hello' });
			tables('custom').upsert({ id: '1', foo: 'bar' });

			const allHelpers = tables.all();
			expect(allHelpers).toHaveLength(2);

			const names = allHelpers.map((h) => h.name).sort();
			expect(names).toEqual(['custom', 'posts']);
		});

		test('names() returns all table names in YJS', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			expect(tables.names()).toHaveLength(0);

			tables('posts').upsert({ id: '1', title: 'Hello' });
			tables('custom').upsert({ id: '1', data: 'test' });

			const names = tables.names().sort();
			expect(names).toEqual(['custom', 'posts']);
		});

		test('defined() returns only schema-defined table helpers', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
				users: table({
					name: 'Users',
					description: '',
					fields: {
						id: id(),
						name: text(),
					},
				}),
			});

			const definedHelpers = tables.defined();
			expect(definedHelpers).toHaveLength(2);

			const names = definedHelpers.map((h) => h.name).sort();
			expect(names).toEqual(['posts', 'users']);

			// Adding dynamic tables doesn't affect defined()
			tables('custom').upsert({ id: '1', data: 'test' });
			expect(tables.defined()).toHaveLength(2);
		});

		test('definedNames() returns only schema-defined table names', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
				users: table({
					name: 'Users',
					description: '',
					fields: {
						id: id(),
						name: text(),
					},
				}),
			});

			const names = tables.definedNames().sort();
			expect(names).toEqual(['posts', 'users']);
		});
	});

	describe('drop()', () => {
		test('drop() removes a table from YJS', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			tables('posts').upsert({ id: '1', title: 'Hello' });
			expect(tables.has('posts')).toBe(true);

			const result = tables.drop('posts');
			expect(result).toBe(true);
			expect(tables.has('posts')).toBe(false);
		});

		test('drop() returns false for non-existent table', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			const result = tables.drop('nonexistent');
			expect(result).toBe(false);
		});

		test('drop() works for dynamic tables', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			tables('custom').upsert({ id: '1', data: 'test' });
			expect(tables.has('custom')).toBe(true);

			tables.drop('custom');
			expect(tables.has('custom')).toBe(false);
		});
	});

	describe('new property names (non-$ prefixed)', () => {
		test('definitions property provides schema definitions', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: 'Blog posts',
					fields: {
						id: id(),
						title: text(),
					},
				}),
			});

			expect(tables.definitions.posts.name).toBe('Posts');
			expect(tables.definitions.posts.description).toBe('Blog posts');
			expect(tables.definitions.posts.fields.id).toBeDefined();
		});

		test('zip() pairs tables with configs', () => {
			const ydoc = new Y.Doc({ guid: 'test-workspace' });
			const tables = createTables(ydoc, {
				posts: table({
					name: 'Posts',
					description: '',
					fields: {
						id: id(),
						title: text(),
					},
				}),
				users: table({
					name: 'Users',
					description: '',
					fields: {
						id: id(),
						name: text(),
					},
				}),
			});

			const configs = {
				posts: { label: 'Blog Posts' },
				users: { label: 'User Accounts' },
			};

			const zipped = tables.zip(configs);
			expect(zipped).toHaveLength(2);

			for (const { name, table: helper, paired } of zipped) {
				expect(helper.name).toBe(name);
				expect(paired.label).toBeDefined();
			}
		});
	});
});
