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

	test('toJSON() returns plain object without methods', () => {
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
			const json = row.toJSON();

			expect(json).toEqual({ id: '1', title: 'Test', published: false });
			expect(typeof (json as any).toJSON).toBe('undefined');
			expect(typeof (json as any).$yRow).toBe('undefined');
		}
	});

	test('JSON.stringify(row) works correctly via toJSON()', () => {
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
			const serialized = JSON.stringify(row);
			const parsed = JSON.parse(serialized);

			expect(parsed).toEqual({ id: '1', title: 'Test', published: false });
		}
	});

	test('toJSON() only includes schema-defined fields', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createTables(ydoc, {
			posts: {
				id: id(),
				title: text(),
			},
		});

		doc.posts.upsert({ id: '1', title: 'Test' });

		const result = doc.posts.get('1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			const yrow = result.row.$yRow;
			yrow.set('extraField', 'should be filtered');

			const json = result.row.toJSON();
			expect(json).toEqual({ id: '1', title: 'Test' });
			expect((json as any).extraField).toBeUndefined();
		}
	});
});
