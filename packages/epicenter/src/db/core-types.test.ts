import { describe, test, expect } from 'bun:test';
import { createEpicenterDb } from './core';
import {
	id,
	text,
	ytext,
	integer,
	boolean,
	select,
	multiSelect,
} from '../core/schema';
import * as Y from 'yjs';

/**
 * Type inference test file for YjsDoc
 * This file tests that generics properly flow through the API
 * Hover over variables to verify types are correctly inferred
 */

describe('YjsDoc Type Inference', () => {
	test('should infer row types from schema', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			posts: {
				id: id(),
				title: text(),
				content: ytext({ nullable: true }),
				tags: multiSelect({ options: ['tech', 'personal', 'work'] }),
				viewCount: integer(),
				published: boolean(),
			},
		});

		// Test insert() - accepts serialized values (strings for ytext, arrays for multi-select)
		doc.tables.posts.insert({
			id: '1',
			title: 'Test Post',
			content: 'Post content', // string (gets converted to Y.Text internally)
			tags: ['tech'], // array (gets converted to Y.Array internally)
			viewCount: 0,
			published: false,
		});

		// Test get() - hover over 'result' to verify inferred type
		const result = doc.tables.posts.get({ id: '1' });
		// Expected type: GetRowResult<{ id: string; title: string; content: Y.Text | null; tags: Y.Array<string>; viewCount: number; published: boolean }>

		if (result.status === 'valid') {
			const row = result.row;
			// Verify property access works
			expect(row.id).toBe('1');
			expect(row.title).toBe('Test Post');
			expect(row.viewCount).toBe(0);
			expect(row.published).toBe(false);

			// Verify YJS types are properly inferred
			expect(row.content).toBeInstanceOf(Y.Text);
			expect(row.tags).toBeInstanceOf(Y.Array);
		}
	});

	test('should infer types for getAll()', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			products: {
				id: id(),
				name: text(),
				price: integer(),
				inStock: boolean(),
			},
		});

		doc.tables.products.insertMany([
			{ id: '1', name: 'Widget', price: 1000, inStock: true },
			{ id: '2', name: 'Gadget', price: 2000, inStock: false },
		]);

		// Hover over 'products' to verify array element type
		const results = doc.tables.products.getAll();
		const products = results
			.filter((r) => r.status === 'valid')
			.map((r) => r.row);
		// Expected type: Array<{ id: string; name: string; price: number; inStock: boolean }>

		expect(products).toHaveLength(2);
	});

	test('should infer predicate parameter types in filter()', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			tasks: {
				id: id(),
				title: text(),
				completed: boolean(),
				priority: select({ options: ['low', 'medium', 'high'] }),
			},
		});

		doc.tables.tasks.insertMany([
			{ id: '1', title: 'Task 1', completed: false, priority: 'high' },
			{ id: '2', title: 'Task 2', completed: true, priority: 'low' },
		]);

		// Hover over 'task' parameter to verify inferred type
		const filterResults = doc.tables.tasks.filter((task) => !task.completed);
		const incompleteTasks = filterResults
			.filter((r) => r.status === 'valid')
			.map((r) => r.row);
		// task type should be: { id: string; title: string; completed: boolean; priority: string }

		expect(incompleteTasks).toHaveLength(1);
		expect(incompleteTasks[0]?.title).toBe('Task 1');
	});

	test('should infer predicate parameter types in find()', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			items: {
				id: id(),
				name: text(),
				quantity: integer(),
			},
		});

		doc.tables.items.insertMany([
			{ id: '1', name: 'Item 1', quantity: 5 },
			{ id: '2', name: 'Item 2', quantity: 0 },
		]);

		// Hover over 'item' parameter to verify inferred type
		const outOfStockResult = doc.tables.items.find(
			(item) => item.quantity === 0,
		);
		// item type should be: { id: string; name: string; quantity: number }

		expect(outOfStockResult.status).toBe('valid');
		if (outOfStockResult.status === 'valid') {
			expect(outOfStockResult.row.name).toBe('Item 2');
		}
	});

	test('should infer observer handler parameter types', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			notifications: {
				id: id(),
				message: text(),
				read: boolean(),
			},
		});

		const addedNotifications: Array<{
			id: string;
			message: string;
			read: boolean;
		}> = [];

		// Hover over 'row' parameter to verify inferred type
		const unsubscribe = doc.tables.notifications.observe({
			onAdd: (row) => {
				// row type should be: { id: string; message: string; read: boolean }
				addedNotifications.push(row);
			},
			onUpdate: (row) => {
				// row type should be: { id: string; message: string; read: boolean }
			},
			onDelete: (id) => {
				// id type should be: string
			},
		});

		doc.tables.notifications.insert({
			id: '1',
			message: 'Test notification',
			read: false,
		});

		expect(addedNotifications).toHaveLength(1);
		expect(addedNotifications[0]?.message).toBe('Test notification');

		unsubscribe();
	});

		test('should handle nullable YJS types correctly', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			articles: {
				id: id(),
				title: text(),
				description: ytext({ nullable: true }), // Y.Text | null
				content: ytext({ nullable: true }), // Y.Text | null
			},
		});

		// Test with null values
		doc.tables.articles.insert({
			id: '1',
			title: 'Article without content',
			description: null,
			content: null,
		});

		const article1Result = doc.tables.articles.get({ id: '1' });
		expect(article1Result.status).toBe('valid');
		if (article1Result.status === 'valid') {
			expect(article1Result.row.description).toBeNull();
			expect(article1Result.row.content).toBeNull();
		}

		// Test with string values (automatically converted to Y.Text internally)
		doc.tables.articles.insert({
			id: '2',
			title: 'Article with content',
			description: 'A short description',
			content: 'Article content',
		});

		const article2Result = doc.tables.articles.get({ id: '2' });
		if (article2Result.status === 'valid') {
			expect(article2Result.row.description).toBeInstanceOf(Y.Text);
			expect(article2Result.row.content).toBeInstanceOf(Y.Text);
		}
	});

	test('should handle multi-table schemas with proper type inference', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			authors: {
				id: id(),
				name: text(),
				bio: ytext({ nullable: true }),
			},
			books: {
				id: id(),
				authorId: text(),
				title: text(),
				chapters: multiSelect({
					options: ['Chapter 1', 'Chapter 2', 'Chapter 3'],
				}),
				published: boolean(),
			},
		});

		// Test authors table - use plain string (converted to Y.Text internally)
		doc.tables.authors.insert({
			id: 'author-1',
			name: 'John Doe',
			bio: 'Author bio',
		});

		const authorResult = doc.tables.authors.get({ id: 'author-1' });
		// Hover to verify type: GetRowResult<{ id: string; name: string; bio: Y.Text | null }>

		// Test books table - use plain array (converted to Y.Array internally)
		doc.tables.books.insert({
			id: 'book-1',
			authorId: 'author-1',
			title: 'My Book',
			chapters: ['Chapter 1', 'Chapter 2'],
			published: true,
		});

		const bookResult = doc.tables.books.get({ id: 'book-1' });
		// Hover to verify type: GetRowResult<{ id: string; authorId: string; title: string; chapters: Y.Array<string>; published: boolean }>

		expect(authorResult.status).toBe('valid');
		expect(bookResult.status).toBe('valid');
		if (authorResult.status === 'valid') {
			expect(authorResult.row.name).toBe('John Doe');
		}
		if (bookResult.status === 'valid') {
			expect(bookResult.row.title).toBe('My Book');
		}
	});

	test('should properly type insertMany with array of rows', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			comments: {
				id: id(),
				text: text(),
				upvotes: integer(),
			},
		});

		// Hover over the array to verify element type
		const commentsToAdd = [
			{ id: '1', text: 'First comment', upvotes: 5 },
			{ id: '2', text: 'Second comment', upvotes: 10 },
		];

		doc.tables.comments.insertMany(commentsToAdd);

		const results = doc.tables.comments.getAll();
		const comments = results.filter((r) => r.status === 'valid').map((r) => r.row);
		expect(comments).toHaveLength(2);
	});

	test('should handle YJS types in complex scenarios', async () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			documents: {
				id: id(),
				title: text(),
				body: ytext(),
				notes: ytext({ nullable: true }),
				tags: multiSelect({ options: ['tag1', 'tag2'] }),
			},
		});

		// Insert with plain values (automatically converted to Y.js types internally)
		doc.tables.documents.insert({
			id: 'doc-1',
			title: 'My Document',
			body: 'Hello World',
			notes: null,
			tags: ['tag1', 'tag2'],
		});

		// Test retrieval and mutations
		const retrievedResult = doc.tables.documents.get({ id: 'doc-1' });

		if (retrievedResult.status === 'valid') {
			const retrieved = retrievedResult.row;
			// These should all be properly typed
			expect(retrieved.body).toBeInstanceOf(Y.Text);
			expect(retrieved.tags).toBeInstanceOf(Y.Array);
			expect(retrieved.notes).toBeNull();

			// Mutations should work because YJS types are passed by reference
			retrieved.tags.push(['tag1']);
			expect(retrieved.tags.length).toBe(3);
		}
	});

});
