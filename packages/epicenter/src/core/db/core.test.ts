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
		const result = doc.posts.get({ id: '1' });
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row.title).toBe('Test Post');
			expect(result.row.view_count).toBe(0);
			expect(result.row.published).toBe(false);
		}
	});

	test('should handle batch operations', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: text(),
				view_count: integer(),
				published: boolean(),
			},
		});

		// Create multiple rows
		doc.posts.upsertMany({
			rows: [
				{ id: '1', title: 'Post 1', view_count: 10, published: true },
				{ id: '2', title: 'Post 2', view_count: 20, published: false },
			],
		});

		// Retrieve and verify rows
		const row1 = doc.posts.get({ id: '1' });
		const row2 = doc.posts.get({ id: '2' });
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
				view_count: integer(),
				published: boolean(),
			},
		});

		doc.posts.upsertMany({
			rows: [
				{ id: '1', title: 'Post 1', view_count: 10, published: true },
				{ id: '2', title: 'Post 2', view_count: 20, published: false },
				{ id: '3', title: 'Post 3', view_count: 30, published: true },
			],
		});

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
		const doc = createEpicenterDb(ydoc, {
			posts: {
				id: id(),
				title: text(),
				view_count: integer(),
				published: boolean(),
			},
		});

		// Test get() with non-existent id
		const getResult = doc.posts.get({ id: 'non-existent' });
		expect(getResult.status).toBe('not_found');
		if (getResult.status === 'not_found') {
			expect(getResult.id).toBe('non-existent');
		}

		// Test find() with no matches
		const findResult = doc.posts.find((post) => post.id === 'non-existent');
		expect(findResult).toBeNull();
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

		// Upsert with plain strings and arrays (the documented API)
		doc.posts.upsert({
			id: '1',
			title: 'Hello World',
			tags: ['typescript', 'javascript'],
		});

		// Get returns Y.js objects
		const result1 = doc.posts.get({ id: '1' });
		expect(result1.status).toBe('valid');
		if (result1.status === 'valid') {
			expect(result1.row.title).toBeInstanceOf(Y.Text);
			expect(result1.row.tags).toBeInstanceOf(Y.Array);
			expect(result1.row.title.toString()).toBe('Hello World');
			expect(result1.row.tags.toArray()).toEqual(['typescript', 'javascript']);
		}

		// Upsert another post
		doc.posts.upsert({
			id: '2',
			title: 'Second Post',
			tags: ['python'],
		});

		// getAllValid returns Y.js objects
		const rows = doc.posts.getAllValid();
		expect(rows).toHaveLength(2);
		const firstRow = rows[0]!;
		const secondRow = rows[1]!;
		expect(firstRow.title).toBeInstanceOf(Y.Text);
		expect(firstRow.tags).toBeInstanceOf(Y.Array);
		expect(firstRow.title.toString()).toBe('Hello World');
		expect(secondRow.title.toString()).toBe('Second Post');
	});
});
