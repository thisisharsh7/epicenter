import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import { createYjsDocument } from './yjsdoc';
import { id, text, integer, boolean } from './column-schemas';

describe('createYjsDocument', () => {
	test('should create and retrieve rows correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createYjsDocument(ydoc, {
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
		const row = doc.tables.posts.get('1');
		expect(row).toBeDefined();
		expect(row?.title).toBe('Test Post');
		expect(row?.viewCount).toBe(0);
		expect(row?.published).toBe(false);
	});

	test('should handle batch operations', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createYjsDocument(ydoc, {
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

		// Retrieve multiple rows
		const rows = doc.tables.posts.getMany(['1', '2']);
		expect(rows).toHaveLength(2);
		expect(rows[0].title).toBe('Post 1');
		expect(rows[1].title).toBe('Post 2');
	});

	test('should filter and find rows correctly', () => {
		const ydoc = new Y.Doc({ guid: 'test-workspace' });
		const doc = createYjsDocument(ydoc, {
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
		expect(firstDraft?.id).toBe('2');
	});
});
