import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { boolean, id, integer, tags, text, ytext } from '../schema';
import { createEpicenterDb } from './core';

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
		const result = doc.tables.posts.get({ id: '1' });
		expect(result).not.toBeNull();
		if (result && result.data) {
			expect(result.data.title).toBe('Test Post');
			expect(result.data.viewCount).toBe(0);
			expect(result.data.published).toBe(false);
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
		const { error: insertError } = doc.tables.posts.insertMany([
			{ id: '1', title: 'Post 1', viewCount: 10, published: true },
			{ id: '2', title: 'Post 2', viewCount: 20, published: false },
		]);
		expect(insertError).toBeNull();

		// Retrieve and verify rows
		const row1 = doc.tables.posts.get({ id: '1' });
		const row2 = doc.tables.posts.get({ id: '2' });
		expect(row1).not.toBeNull();
		expect(row2).not.toBeNull();
		if (row1 && row1.data) {
			expect(row1.data.title).toBe('Post 1');
		}
		if (row2 && row2.data) {
			expect(row2.data.title).toBe('Post 2');
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
		const publishedPosts = doc.tables.posts.filter((post) => post.published);
		expect(publishedPosts).toHaveLength(2);

		// Find first unpublished post
		const firstDraft = doc.tables.posts.find((post) => !post.published);
		expect(firstDraft).not.toBeNull();
		if (firstDraft) {
			expect(firstDraft.id).toBe('2');
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
		const getResult = doc.tables.posts.get({ id: 'non-existent' });
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
				tags: tags({ options: ['typescript', 'javascript', 'python'] }),
			},
		});

		// Insert with plain strings and arrays (the documented API)
		doc.tables.posts.insert({
			id: '1',
			title: 'Hello World',
			tags: ['typescript', 'javascript'],
		});

		// Get returns Y.js objects
		const result1 = doc.tables.posts.get({ id: '1' });
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
		const results = doc.tables.posts.getAll();
		const rows = results.filter((r) => r.status === 'valid').map((r) => r.row);
		expect(rows).toHaveLength(2);
		expect(rows[0].title).toBeInstanceOf(Y.Text);
		expect(rows[0].tags).toBeInstanceOf(Y.Array);
		expect(rows[0].title.toString()).toBe('Hello World');
		expect(rows[1].title.toString()).toBe('Second Post');
	});
});
