import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { boolean, id, integer, tags, text, richtext } from '../schema';
import { createTables } from './core';

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
			tables.posts.observe({
				onAdd: (result) => {
					if (result.status === 'valid') {
						addedRows.push(result.row.id);
					}
				},
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
			tables.posts.observe({
				onUpdate: (result) => {
					if (result.status === 'valid') {
						updates.push({ id: result.row.id, title: result.row.title });
					}
				},
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
			tables.posts.observe({
				onDelete: (rowId) => {
					deletedIds.push(rowId);
				},
			});

			tables.posts.delete('post-1');

			expect(deletedIds).toEqual(['post-1']);
		});

		test('callbacks receive RowResult types with validation', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const tables = createTables(ydoc, {
				posts: {
					id: id(),
					title: text(),
				},
			});

			let isValid = false;
			let isInvalid = false;
			let callbackFired = false;

			tables.posts.observe({
				onAdd: (result) => {
					callbackFired = true;
					isValid = result.status === 'valid';
					isInvalid = result.status === 'invalid';
				},
			});

			tables.posts.upsert({ id: 'post-1', title: 'Test' });

			expect(callbackFired).toBe(true);
			expect(isValid).toBe(true);
			expect(isInvalid).toBe(false);
		});

		test('validation errors are passed to callbacks', () => {
			const ydoc = new Y.Doc({ guid: 'test-observe' });
			const ytableArrays = ydoc.getMap('tables') as Y.Map<
				Y.Array<{ key: string; val: unknown }>
			>;

			const tables = createTables(ydoc, {
				posts: {
					id: id(),
					count: integer(),
				},
			});

			let receivedInvalid = false;
			tables.posts.observe({
				onAdd: (result) => {
					if (result.status === 'invalid') {
						receivedInvalid = true;
					}
				},
			});

			const postsArray =
				ytableArrays.get('posts') ??
				new Y.Array<{ key: string; val: unknown }>();
			if (!ytableArrays.has('posts')) {
				ytableArrays.set('posts', postsArray);
			}
			postsArray.push([
				{ key: 'bad-row', val: { id: 'bad-row', count: 'not a number' } },
			]);

			expect(receivedInvalid).toBe(true);
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
			const unsubscribe = tables.posts.observe({
				onAdd: (result) => {
					if (result.status === 'valid') {
						addedIds.push(result.row.id);
					}
				},
			});

			tables.posts.upsert({ id: 'post-1', title: 'First' });
			unsubscribe();
			tables.posts.upsert({ id: 'post-2', title: 'Second' });

			expect(addedIds).toEqual(['post-1']);
		});
	});
});
