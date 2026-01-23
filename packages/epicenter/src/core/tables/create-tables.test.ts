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
		test('observe fires when row is added via upsert', () => {
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

			// Use a Set to collect unique IDs (observer may fire multiple times per transaction)
			const changedRows = new Set<string>();
			tables('posts').observe((changedIds) => {
				for (const id of changedIds) {
					changedRows.add(id);
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

			expect(changedRows.has('post-1')).toBe(true);
			expect(changedRows.has('post-2')).toBe(true);
			expect(changedRows.size).toBe(2);
		});

		test('observe fires when row field is modified', () => {
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
			tables('posts').observe((changedIds) => {
				for (const id of changedIds) {
					const result = tables('posts').get(id);
					// New API cannot distinguish add vs update, check if row exists
					if (result.status === 'valid') {
						updates.push({
							id,
							title: result.row.title,
						});
					}
				}
			});

			tables('posts').update({ id: 'post-1', title: 'Updated' });
			tables('posts').update({ id: 'post-1', view_count: 100 });

			expect(updates).toHaveLength(2);
			expect(updates[0]?.title).toBe('Updated');
		});

		test('observe fires when row is removed', () => {
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
			tables('posts').observe((changedIds) => {
				for (const id of changedIds) {
					// Check if row was deleted by seeing if it no longer exists
					const result = tables('posts').get(id);
					if (result.status === 'not_found') {
						deletedIds.push(id);
					}
				}
			});

			tables('posts').delete('post-1');

			expect(deletedIds).toEqual(['post-1']);
		});

		test('callbacks can access row data via get()', () => {
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

			tables('posts').observe((changedIds) => {
				for (const id of changedIds) {
					const result = tables('posts').get(id);
					// For non-deleted rows, we can access the data
					if (result.status === 'valid') {
						receivedRows.push({ id, title: result.row.title });
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
			tables('posts').observe((changedIds) => {
				for (const id of changedIds) {
					receivedResult = tables('posts').get(id);
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

			// Use a Set to collect unique IDs (observer may fire multiple times per transaction)
			const changedIds = new Set<string>();
			const unsubscribe = tables('posts').observe((ids) => {
				for (const id of ids) {
					changedIds.add(id);
				}
			});

			tables('posts').upsert({ id: 'post-1', title: 'First' });
			unsubscribe();
			tables('posts').upsert({ id: 'post-2', title: 'Second' });

			// Only post-1 should be observed; post-2 happened after unsubscribe
			expect(changedIds.has('post-1')).toBe(true);
			expect(changedIds.has('post-2')).toBe(false);
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
			const allChangedIds: Set<string>[] = [];

			tables('posts').observe((changedIds) => {
				callbackCount++;
				allChangedIds.push(new Set(changedIds));
			});

			tables('posts').upsertMany([
				{ id: 'post-1', title: 'First' },
				{ id: 'post-2', title: 'Second' },
				{ id: 'post-3', title: 'Third' },
			]);

			expect(callbackCount).toBe(1);
			expect(allChangedIds[0]?.size).toBe(3);
			expect(allChangedIds[0]?.has('post-1')).toBe(true);
			expect(allChangedIds[0]?.has('post-2')).toBe(true);
			expect(allChangedIds[0]?.has('post-3')).toBe(true);
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
			const allChangedIds: Set<string>[] = [];

			tables('posts').observe((changedIds) => {
				callbackCount++;
				allChangedIds.push(new Set(changedIds));
			});

			ydoc.transact(() => {
				tables('posts').update({ id: 'post-1', title: 'Updated First' });
				tables('posts').update({ id: 'post-2', title: 'Updated Second' });
			});

			expect(callbackCount).toBe(1);
			expect(allChangedIds[0]?.size).toBe(2);
			expect(allChangedIds[0]?.has('post-1')).toBe(true);
			expect(allChangedIds[0]?.has('post-2')).toBe(true);
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
			let lastChangedIds: Set<string> = new Set();

			tables('posts').observe((changedIds) => {
				callbackCount++;
				lastChangedIds = new Set(changedIds);
			});

			ydoc.transact(() => {
				tables('posts').update({ id: 'post-1', title: 'Updated' });
				tables('posts').upsert({ id: 'post-2', title: 'New' });
				tables('posts').delete('post-1');
			});

			expect(callbackCount).toBe(1);
			// post-1 was deleted, post-2 was added - both should be in changed set
			expect(lastChangedIds.has('post-1')).toBe(true);
			expect(lastChangedIds.has('post-2')).toBe(true);
			// Verify the actual state: post-1 deleted, post-2 exists
			expect(tables('posts').get('post-1').status).toBe('not_found');
			expect(tables('posts').get('post-2').status).toBe('valid');
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
			let lastChangedIds: Set<string> = new Set();

			tables('posts').observe((changedIds) => {
				callbackCount++;
				lastChangedIds = new Set(changedIds);
			});

			tables('posts').deleteMany(['post-1', 'post-2']);

			expect(callbackCount).toBe(1);
			expect(lastChangedIds.size).toBe(2);
			expect(lastChangedIds.has('post-1')).toBe(true);
			expect(lastChangedIds.has('post-2')).toBe(true);
			// Verify they were actually deleted
			expect(tables('posts').get('post-1').status).toBe('not_found');
			expect(tables('posts').get('post-2').status).toBe('not_found');
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
				title?: string;
				view_count?: number;
			};
			let lastChange: ChangeRecord | null = null;

			tables('posts').observe((changedIds) => {
				callbackCount++;
				if (changedIds.has('post-1')) {
					const result = tables('posts').get('post-1');
					if (result.status === 'valid') {
						lastChange = {
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
			// New API doesn't provide action type, but we can verify final values
			expect(change.title).toBe('Second Update');
			expect(change.view_count).toBe(100);
		});

		test('empty row deleted before first cell change emits change', () => {
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

			// Use a Set to collect unique IDs (observer may fire multiple times)
			const changedRowIds = new Set<string>();
			tables('posts').observe((changedIds) => {
				for (const rowId of changedIds) {
					changedRowIds.add(rowId);
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

			// The row ID should be in the changed set; verify deletion via get()
			expect(changedRowIds.has('empty-row')).toBe(true);
			expect(tables('posts').get('empty-row').status).toBe('not_found');
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
			tables('posts').observe((changedIds) => {
				for (const rowId of changedIds) {
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

			// Use Sets to collect unique IDs (observer may fire multiple times per transaction)
			const subscriber1Changes = new Set<string>();
			const subscriber2Changes = new Set<string>();

			const unsub1 = tables('posts').observe((changedIds) => {
				for (const rowId of changedIds) {
					subscriber1Changes.add(rowId);
				}
			});

			const unsub2 = tables('posts').observe((changedIds) => {
				for (const rowId of changedIds) {
					subscriber2Changes.add(rowId);
				}
			});

			tables('posts').upsert({ id: 'post-1', title: 'Test' });

			expect(subscriber1Changes.has('post-1')).toBe(true);
			expect(subscriber2Changes.has('post-1')).toBe(true);

			unsub1();

			tables('posts').upsert({ id: 'post-2', title: 'Second' });

			// Subscriber 1 unsubscribed, should not see post-2
			expect(subscriber1Changes.has('post-2')).toBe(false);
			// Subscriber 2 should see both
			expect(subscriber2Changes.has('post-1')).toBe(true);
			expect(subscriber2Changes.has('post-2')).toBe(true);

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

			// Access a table not in definition
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

		test('defined() returns only definition-declared table helpers', () => {
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

		test('definedNames() returns only definition-declared table names', () => {
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

	describe('new property names (non-$ prefixed)', () => {
		test('definitions property provides table definitions', () => {
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
