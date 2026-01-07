import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { boolean, id, integer, tags, text, richtext } from '../schema';
import { createTables } from './create-tables';

describe('createTables', () => {
	test('should create and retrieve rows correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: {
				id: id(),
				title: text(),
				view_count: integer(),
				published: boolean(),
			},
		});

		// Create a row
		doc.posts.upsert({
			id: '1',
			title: 'Test Post',
			view_count: 0,
			published: false,
		});

		// Retrieve the row
		const result = doc.posts.get('1');
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
			posts: {
				id: id(),
				title: text(),
				view_count: integer(),
				published: boolean(),
			},
		});

		// Create multiple rows
		doc.posts.upsertMany([
			{ id: '1', title: 'Post 1', view_count: 10, published: true },
			{ id: '2', title: 'Post 2', view_count: 20, published: false },
		]);

		// Retrieve and verify rows
		const row1 = doc.posts.get('1');
		const row2 = doc.posts.get('2');
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
			posts: {
				id: id(),
				title: text(),
				view_count: integer(),
				published: boolean(),
			},
		});

		doc.posts.upsertMany([
			{ id: '1', title: 'Post 1', view_count: 10, published: true },
			{ id: '2', title: 'Post 2', view_count: 20, published: false },
			{ id: '3', title: 'Post 3', view_count: 30, published: true },
		]);

		// Filter published posts
		const publishedPosts = doc.posts.filter((post) => post.published);
		expect(publishedPosts).toHaveLength(2);

		// Find first unpublished post
		const firstDraft = doc.posts.find((post) => !post.published);
		expect(firstDraft).not.toBeNull();
		if (firstDraft) {
			expect(firstDraft.id).toBe('2');
		}
	});

	test('should return not_found status for non-existent rows', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: {
				id: id(),
				title: text(),
				view_count: integer(),
				published: boolean(),
			},
		});

		// Test get() with non-existent id
		const getResult = doc.posts.get('non-existent');
		expect(getResult.status).toBe('not_found');
		if (getResult.status === 'not_found') {
			expect(getResult.id).toBe('non-existent');
		}

		// Test find() with no matches
		const findResult = doc.posts.find((post) => post.id === 'non-existent');
		expect(findResult).toBeNull();
	});

	test('should store and retrieve richtext and tags correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: {
				id: id(),
				title: richtext(),
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			},
		});

		doc.posts.upsert({
			id: '1',
			title: 'rtxt_hello123',
			tags: ['typescript', 'javascript'],
		});

		const result1 = doc.posts.get('1');
		expect(result1.status).toBe('valid');
		if (result1.status === 'valid') {
			expect(result1.row.title).toBe('rtxt_hello123');
			expect(result1.row.tags).toEqual(['typescript', 'javascript']);
		}

		doc.posts.upsert({
			id: '2',
			title: 'rtxt_second456',
			tags: ['python'],
		});

		const rows = doc.posts.getAllValid();
		expect(rows).toHaveLength(2);
		const firstRow = rows[0]!;
		const secondRow = rows[1]!;
		expect(firstRow.title).toBe('rtxt_hello123');
		expect(secondRow.title).toBe('rtxt_second456');
	});

	test('rows are plain JSON-serializable objects', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: {
				id: id(),
				title: text(),
				published: boolean(),
			},
		});

		doc.posts.upsert({ id: '1', title: 'Test', published: false });

		const result = doc.posts.get('1');
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
				posts: {
					id: id(),
					title: text(),
					published: boolean(),
				},
			});

			const addedRows: string[] = [];
			tables.posts.observeChanges((changes) => {
				for (const [id, change] of changes) {
					if (change.action === 'add') {
						addedRows.push(id);
					}
				}
			});

			tables.posts.upsert({ id: 'post-1', title: 'First', published: false });
			tables.posts.upsert({ id: 'post-2', title: 'Second', published: true });

			expect(addedRows).toEqual(['post-1', 'post-2']);
		});

		test('onUpdate fires when row field is modified', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: {
					id: id(),
					title: text(),
					view_count: integer(),
				},
			});

			tables.posts.upsert({ id: 'post-1', title: 'Original', view_count: 0 });

			const updates: Array<{ id: string; title: string }> = [];
			tables.posts.observeChanges((changes) => {
				for (const [id, change] of changes) {
					if (change.action === 'update' && change.result.status === 'valid') {
						updates.push({
							id,
							title: change.result.row.title,
						});
					}
				}
			});

			tables.posts.update({ id: 'post-1', title: 'Updated' });
			tables.posts.update({ id: 'post-1', view_count: 100 });

			expect(updates).toHaveLength(2);
			expect(updates[0]?.title).toBe('Updated');
		});

		test('onDelete fires when row is removed', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: {
					id: id(),
					title: text(),
				},
			});

			tables.posts.upsert({ id: 'post-1', title: 'First' });
			tables.posts.upsert({ id: 'post-2', title: 'Second' });

			const deletedIds: string[] = [];
			tables.posts.observeChanges((changes) => {
				for (const [id, change] of changes) {
					if (change.action === 'delete') {
						deletedIds.push(id);
					}
				}
			});

			tables.posts.delete('post-1');

			expect(deletedIds).toEqual(['post-1']);
		});

		test('callbacks receive raw row data', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: {
					id: id(),
					title: text(),
				},
			});

			const receivedRows: Array<{ id: string; title: string }> = [];

			tables.posts.observeChanges((changes) => {
				for (const [id, change] of changes) {
					if (change.action === 'add' && change.result.status === 'valid') {
						receivedRows.push({ id, title: change.result.row.title });
					}
				}
			});

			tables.posts.upsert({ id: 'post-1', title: 'Test' });

			expect(receivedRows).toHaveLength(1);
			expect(receivedRows[0]).toEqual({ id: 'post-1', title: 'Test' });
		});

		test('raw values passed through even for invalid data', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			type CellEntry = { key: string; val: unknown };
			type RowArray = Y.Array<CellEntry>;
			type TableMap = Y.Map<RowArray>;
			type TablesMap = Y.Map<TableMap>;

			const ytables: TablesMap = ydoc.getMap('tables');

			const tables = createTables(ydoc, {
				posts: {
					id: id(),
					count: integer(),
				},
			});

			let receivedResult: unknown = null;
			tables.posts.observeChanges((changes) => {
				for (const [_id, change] of changes) {
					if (change.action === 'add') {
						receivedResult = change.result;
					}
				}
			});

			let postsTable = ytables.get('posts');
			if (!postsTable) {
				postsTable = new Y.Map() as TableMap;
				ytables.set('posts', postsTable);
			}

			const rowArray = new Y.Array() as RowArray;
			postsTable.set('bad-row', rowArray);
			rowArray.push([
				{ key: 'id', val: 'bad-row' },
				{ key: 'count', val: 'not a number' },
			]);

			expect(receivedResult).toMatchObject({
				status: 'invalid',
				row: { id: 'bad-row', count: 'not a number' },
			});
		});

		test('unsubscribe stops callbacks', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: {
					id: id(),
					title: text(),
				},
			});

			const addedIds: string[] = [];
			const unsubscribe = tables.posts.observeChanges((changes) => {
				for (const [id, change] of changes) {
					if (change.action === 'add') {
						addedIds.push(id);
					}
				}
			});

			tables.posts.upsert({ id: 'post-1', title: 'First' });
			unsubscribe();
			tables.posts.upsert({ id: 'post-2', title: 'Second' });

			expect(addedIds).toEqual(['post-1']);
		});
	});
});
