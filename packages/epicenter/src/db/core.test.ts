import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import { createEpicenterDb } from './core';
import {
	id,
	text,
	integer,
	boolean,
	ytext,
	multiSelect,
} from '../core/column-schemas';

describe('createEpicenterDb', () => {
	test('should create and retrieve rows correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: text(),
				viewCount: integer(),
				published: boolean(),
			},
		});

		// Create a row
		doc.tables.posts.insert({
			id: '1',
			title: 'Test Post',
			viewCount: 0,
			published: false,
		});

		// Retrieve the row
		const result = doc.tables.posts.get('1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row.title).toBe('Test Post');
			expect(result.row.viewCount).toBe(0);
			expect(result.row.published).toBe(false);
		}
	});

	test('should handle batch operations', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: text(),
				viewCount: integer(),
				published: boolean(),
			},
		});

		// Create multiple rows
		doc.tables.posts.insertMany([
			{ id: '1', title: 'Post 1', viewCount: 10, published: true },
			{ id: '2', title: 'Post 2', viewCount: 20, published: false },
		]);

		// Retrieve and verify rows
		const row1 = doc.tables.posts.get('1');
		const row2 = doc.tables.posts.get('2');
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
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: text(),
				viewCount: integer(),
				published: boolean(),
			},
		});

		doc.tables.posts.insertMany([
			{ id: '1', title: 'Post 1', viewCount: 10, published: true },
			{ id: '2', title: 'Post 2', viewCount: 20, published: false },
			{ id: '3', title: 'Post 3', viewCount: 30, published: true },
		]);

		// Filter published posts
		const { valid: publishedPosts } = doc.tables.posts.filter(
			(post) => post.published,
		);
		expect(publishedPosts).toHaveLength(2);

		// Find first unpublished post
		const firstDraft = doc.tables.posts.find((post) => !post.published);
		expect(firstDraft.status).toBe('valid');
		if (firstDraft.status === 'valid') {
			expect(firstDraft.row.id).toBe('2');
		}
	});

	test('should return not-found status for non-existent rows', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: text(),
				viewCount: integer(),
				published: boolean(),
			},
		});

		// Test get() with non-existent id
		const getResult = doc.tables.posts.get('non-existent');
		expect(getResult.status).toBe('not-found');
		expect(getResult.row).toBeNull();

		// Test find() with no matches
		const findResult = doc.tables.posts.find(
			(post) => post.id === 'non-existent',
		);
		expect(findResult.status).toBe('not-found');
		expect(findResult.row).toBeNull();
	});

	test('should serialize Y.js types with getSerialized and getAllSerialized', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: ytext(),
				tags: multiSelect({ options: ['typescript', 'javascript', 'python'] }),
			},
		});

		// Insert with serialized values
		doc.tables.posts.insert({
			id: '1',
			title: 'Hello World',
			tags: ['typescript', 'javascript'],
		});

		// Get returns Y.js objects
		const rawResult = doc.tables.posts.get('1');
		expect(rawResult.status).toBe('valid');
		if (rawResult.status === 'valid') {
			expect(rawResult.row.title).toBeInstanceOf(Y.Text);
			expect(rawResult.row.tags).toBeInstanceOf(Y.Array);
		}

		// getSerialized returns plain types
		const serializedResult = doc.tables.posts.getSerialized('1');
		expect(serializedResult.status).toBe('valid');
		if (serializedResult.status === 'valid') {
			expect(typeof serializedResult.row.title).toBe('string');
			expect(serializedResult.row.title).toBe('Hello World');
			expect(Array.isArray(serializedResult.row.tags)).toBe(true);
			expect(serializedResult.row.tags).toEqual(['typescript', 'javascript']);
		}

		// Insert another post
		doc.tables.posts.insert({
			id: '2',
			title: 'Second Post',
			tags: ['python'],
		});

		// getAll returns Y.js objects
		const { valid: rawRows } = doc.tables.posts.getAll();
		expect(rawRows).toHaveLength(2);
		expect(rawRows[0].title).toBeInstanceOf(Y.Text);
		expect(rawRows[0].tags).toBeInstanceOf(Y.Array);

		// getAllSerialized returns plain types
		const { valid: serializedRows } = doc.tables.posts.getAllSerialized();
		expect(serializedRows).toHaveLength(2);
		expect(typeof serializedRows[0].title).toBe('string');
		expect(Array.isArray(serializedRows[0].tags)).toBe(true);
		expect(serializedRows[0].title).toBe('Hello World');
		expect(serializedRows[1].title).toBe('Second Post');
	});
});
