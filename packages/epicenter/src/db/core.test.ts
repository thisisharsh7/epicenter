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
} from '../core/schema';

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

	test('should store and retrieve Y.js types correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: ytext(),
				tags: multiSelect({ options: ['typescript', 'javascript', 'python'] }),
			},
		});

		// Insert with plain strings and arrays (the documented API)
		doc.tables.posts.insert({
			id: '1',
			title: 'Hello World',
			tags: ['typescript', 'javascript'],
		});

		// Get returns Y.js objects
		const result1 = doc.tables.posts.get('1');
		expect(result1.status).toBe('valid');
		if (result1.status === 'valid') {
			expect(result1.row.title).toBeInstanceOf(Y.Text);
			expect(result1.row.tags).toBeInstanceOf(Y.Array);
			expect(result1.row.title.toString()).toBe('Hello World');
			expect(result1.row.tags.toArray()).toEqual(['typescript', 'javascript']);
		}

		// Insert another post
		doc.tables.posts.insert({
			id: '2',
			title: 'Second Post',
			tags: ['python'],
		});

		// getAll returns Y.js objects
		const { valid: rows } = doc.tables.posts.getAll();
		expect(rows).toHaveLength(2);
		expect(rows[0].title).toBeInstanceOf(Y.Text);
		expect(rows[0].tags).toBeInstanceOf(Y.Array);
		expect(rows[0].title.toString()).toBe('Hello World');
		expect(rows[1].title.toString()).toBe('Second Post');
	});
});
